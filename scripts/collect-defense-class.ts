import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { espnJson } from "../src/lib/providers/espn-college";
import { fetchDefensiveSeasons } from "../src/lib/providers/espn-defense";
import type { DefensiveSeason } from "../src/lib/domain/defense-model";
import { prospectSchema } from "../src/lib/domain/prospects";
import { defensePlayer } from "./export-defense-prospects";

/** Builds the current-class (2027) defender pool: juniors and seniors by 2026 production, then three seasons of logs. */
const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football";
const SEASON = 2026, DRAFT_YEAR = 2027, PER_GROUP = 80, MIN_GAMES = 4;
const GROUPS: Record<string, "DL" | "LB" | "DB"> = { DL: "DL", DE: "DL", DT: "DL", NT: "DL", EDGE: "DL", LB: "LB", OLB: "LB", ILB: "LB", MLB: "LB", DB: "DB", CB: "DB", S: "DB", FS: "DB", SS: "DB", NB: "DB" };
const athleteSchema = z.object({ id: z.string(), displayName: z.string(), displayHeight: z.string().optional(), weight: z.number().optional(), headshot: z.object({ href: z.string() }).optional(), position: z.object({ abbreviation: z.string() }), experience: z.object({ years: z.number() }).optional() });
const rosterSchema = z.object({ athletes: z.array(z.object({ items: z.array(athleteSchema) })) });
const teamsSchema = z.object({ sports: z.array(z.object({ leagues: z.array(z.object({ teams: z.array(z.object({ team: z.object({ id: z.string(), location: z.string() }) })) })) })) });
const production = (s: DefensiveSeason) => (s.tackles * .75 + s.sacks * 4 + s.interceptions * 5 + s.passesDefended * 1.5 + s.forcedFumbles * 3) / Math.max(s.games, 1);

async function pool<T, R>(items: T[], size: number, task: (item: T) => Promise<R>) {
  const out: R[] = []; let next = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (next < items.length) { const i = next++; out[i] = await task(items[i]); } }));
  return out;
}
const safe = async <T>(run: () => Promise<T>, fallback: T) => { try { return await run(); } catch { return fallback; } };
const inches = (height?: string) => { const m = height?.match(/(\d+)'\s*(\d+)/); return m ? Number(m[1]) * 12 + Number(m[2]) : null; };

async function main() {
  const teams = teamsSchema.parse(await espnJson(`${SITE}/teams?groups=80&limit=500`)).sports.flatMap(s => s.leagues.flatMap(l => l.teams.map(t => t.team)));
  const rosters = await pool(teams, 8, team => safe(async () => rosterSchema.parse(await espnJson(`${SITE}/teams/${team.id}/roster?season=${SEASON}`)).athletes.flatMap(g => g.items).filter(a => GROUPS[a.position.abbreviation] && (a.experience?.years ?? 0) >= 3).map(a => ({ ...a, group: GROUPS[a.position.abbreviation], school: team.location })), []));
  const candidates = rosters.flat();
  console.log(`${teams.length} teams, ${candidates.length} upperclass defenders`);
  const latest = await pool(candidates, 8, c => safe(() => fetchDefensiveSeasons(c.id, SEASON, espnJson, 1), []));
  const ranked = candidates.map((c, i) => ({ c, latest: latest[i][0] })).filter(x => x.latest && x.latest.games >= MIN_GAMES);
  const picked = (["DL", "LB", "DB"] as const).flatMap(g => ranked.filter(x => x.c.group === g).sort((a, b) => production(b.latest) - production(a.latest)).slice(0, PER_GROUP));
  const histories = await pool(picked, 8, x => safe(() => fetchDefensiveSeasons(x.c.id, SEASON, espnJson, 3), []));
  const asOf = new Date().toISOString().slice(0, 10);
  const entries = picked.map((x, i) => {
    const id = `defense-${DRAFT_YEAR}-${x.c.id}`;
    const seasons = histories[i];
    return {
      prospect: prospectSchema.parse({ id, name: x.c.displayName, school: x.c.school, position: x.c.group, draftYear: DRAFT_YEAR, rank: 1 + i % PER_GROUP, source: "ESPN rosters", sourceUrl: `${SITE}/teams`, asOf }),
      college: defensePlayer(id, x.c.id, x.c.displayName, x.c.school, x.c.group, inches(x.c.displayHeight), x.c.weight ?? null, seasons, x.c.headshot?.href.startsWith("https://a.espncdn.com/") ? x.c.headshot.href : null),
    };
  }).filter(e => e.college.seasons.length);
  const file = "src/lib/data/defense-prospects.json";
  const current = JSON.parse(await readFile(file, "utf8"));
  await writeFile(file, JSON.stringify({ ...current, current: entries }) + "\n");
  console.log(`Saved ${entries.length} ${DRAFT_YEAR} defenders`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
