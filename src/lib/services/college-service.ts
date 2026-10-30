import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { collegePlayerSchema, type CollegePlayer } from "@/lib/domain/college-model";
import { getCollegeProspects } from "@/lib/db/repositories/prospect-repository";
import { getAppState, setAppState } from "@/lib/db/repositories/settings-repository";
import { espnJson, fetchCollegePlayer, fetchCollegeRoster, fetchCollegeTeams, matchCollegeAthlete, schoolKey, type CollegeAthlete, type JsonLoader } from "@/lib/providers/espn-college";

const KEY = "college-production:v1";
export interface CollegeSyncResult { updated: number; total: number; unmatched: string[]; errors: string[]; syncedAt: string; }
export async function getCollegeProduction(): Promise<CollegePlayer[]> {
  const data = await getAppState<unknown>(KEY);
  return data ? collegePlayerSchema.array().parse(data) : [];
}
export async function getCollegeSyncStatus() { return getAppState<CollegeSyncResult>(`${KEY}:status`); }

/** Public response cache doubles as reproducible model input evidence. No cookies or tokens. */
function cachedLoader(force: boolean): JsonLoader {
  const requests = new Map<string, Promise<unknown>>();
  const directory = path.resolve(process.cwd(), "data", "college-cache");
  return url => {
    if (requests.has(url)) return requests.get(url)!;
    const request = (async () => {
      const file = path.join(directory, `${createHash("sha256").update(url).digest("hex")}.json`);
      if (!force) {
        try {
          const cached = JSON.parse(await readFile(file, "utf8")) as { fetchedAt: number; data: unknown };
          if (Date.now() - cached.fetchedAt < 6 * 60 * 60 * 1000) return cached.data;
        } catch { /* First sync or invalid cache; fetch a fresh response. */ }
      }
      const data = await espnJson(url);
      await mkdir(directory, { recursive: true });
      await writeFile(file, JSON.stringify({ url, fetchedAt: Date.now(), data }));
      return data;
    })();
    requests.set(url, request);
    return request;
  };
}

async function mapLimited<T, R>(items: T[], work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; results[index] = await work(items[index]); }
  }));
  return results;
}

const syncState = globalThis as unknown as { collegeSync?: Promise<CollegeSyncResult> };
export function syncCollegeProduction(force = false, onProgress?: (message: string) => void) {
  if (syncState.collegeSync) return syncState.collegeSync;
  syncState.collegeSync = runSync(force, onProgress).finally(() => { syncState.collegeSync = undefined; });
  return syncState.collegeSync;
}

async function runSync(force: boolean, onProgress?: (message: string) => void): Promise<CollegeSyncResult> {
  const prospects = await getCollegeProspects();
  if (!prospects.length) throw new Error("Import a prospect class before syncing production.");
  const previous = await getCollegeProduction();
  const load = cachedLoader(force);
  const teams = await fetchCollegeTeams(load);
  const year = new Date().getFullYear();
  const schools = new Set(prospects.map(p => schoolKey(p.school)));
  // Include previously verified schools after transfers.
  previous.forEach(p => schools.add(schoolKey(p.school)));
  const selectedTeams = teams.filter(t => schools.has(schoolKey(t.location)));
  const errors: string[] = [];
  onProgress?.(`Fetching ${selectedTeams.length} college rosters for ${year}`);
  const rosters = await mapLimited(selectedTeams, async team => {
    try { return await fetchCollegeRoster(team, year, load); }
    catch (error) { errors.push(`${team.location}: ${error instanceof Error ? error.message : "roster unavailable"}`); return []; }
  });
  const athletes: CollegeAthlete[] = rosters.flat();
  const unmatched: string[] = [];
  let completed = 0;
  const players = await mapLimited(prospects, async prospect => {
    const athlete = matchCollegeAthlete(prospect, athletes);
    if (!athlete) { unmatched.push(prospect.name); return null; }
    try {
      const player = await fetchCollegePlayer(prospect, athlete, Math.min(year, prospect.draftYear - 1), load);
      for (const season of player.seasons) season.school = teams.find(t => t.id === season.teamId)?.location ?? season.school;
      if (!player.seasons.length && previous.find(p => p.prospectId === prospect.id)?.seasons.length) throw new Error("Empty response; retained previous production");
      completed++;
      if (completed % 20 === 0) onProgress?.(`Loaded production for ${completed}/${prospects.length} prospects`);
      return player;
    } catch (error) { errors.push(`${prospect.name}: ${error instanceof Error ? error.message : "statistics unavailable"}`); return null; }
  });
  const updated = players.filter((p): p is CollegePlayer => p !== null);
  const merged = new Map(previous.map(p => [p.prospectId, p]));
  updated.forEach(p => merged.set(p.prospectId, p));
  await setAppState(KEY, collegePlayerSchema.array().parse([...merged.values()]));
  const status = { updated: updated.length, total: prospects.length, unmatched, errors, syncedAt: new Date().toISOString() };
  await setAppState(`${KEY}:status`, status);
  return status;
}
