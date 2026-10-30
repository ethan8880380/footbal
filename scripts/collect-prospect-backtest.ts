import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import Papa from "papaparse";
import { z } from "zod";
import { fetchWithRetry, HttpError } from "../src/lib/http/fetch-with-retry";
import { fetchCollegePlayer, type JsonLoader } from "../src/lib/providers/espn-college";
import { evaluateCollegePlayer } from "../src/lib/domain/college-model";
import { prospectSchema } from "../src/lib/domain/prospects";

const directory = "data/backtest";
const recent = process.argv.includes("--recent");
const sources = {
  players: "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv",
  draft: "https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv",
  nfl: "https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv",
  "nfl-2025": "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2025.csv",
  "nfl-2026": "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv",
};
async function main() {
  await mkdir(`${directory}/responses`, { recursive: true });
  const provenance: { url: string; sha256: string }[] = [];
  async function csv(key: keyof typeof sources) {
    const file = `${directory}/${key}.csv`;
    let text: string;
    try { text = await readFile(file, "utf8"); }
    catch { text = await (await fetchWithRetry(sources[key])).text(); await writeFile(file, text); }
    provenance.push({ url: sources[key], sha256: createHash("sha256").update(text).digest("hex") });
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    if (parsed.errors.length) throw new Error(`Malformed ${key} CSV`);
    return parsed.data;
  }
  const [players, draft, nfl] = await Promise.all([csv("players"), csv("draft"), csv("nfl")]);
  if (recent) nfl.push(...await csv("nfl-2025"), ...await csv("nfl-2026"));
  for (let year = 2016; year <= 2024; year++) {
    const weeks = new Set(nfl.filter(r => +r.season === year && r.season_type === "REG").map(r => +r.week));
    if (!weeks.has(year >= 2021 ? 18 : 17)) throw new Error(`Incomplete NFL season ${year}`);
  }
  const requests = new Map<string, Promise<unknown>>();
  const load: JsonLoader = url => {
    if (requests.has(url)) return requests.get(url)!;
    const promise = (async () => {
      const file = `${directory}/responses/${createHash("sha256").update(url).digest("hex")}.json`;
      try {
        const cached = JSON.parse(await readFile(file, "utf8"));
        if (cached.status === 404) throw new HttpError(url, 404, "Cached 404");
        return cached.data;
      } catch (error) { if (error instanceof HttpError) throw error; }
      try {
        const data = await (await fetchWithRetry(url, { timeoutMs: 15000, retries: 1 })).json();
        await writeFile(file, JSON.stringify({ url, fetchedAt: new Date().toISOString(), data }));
        return data;
      } catch (error) {
        if (error instanceof HttpError && error.status === 404) await writeFile(file, JSON.stringify({ url, status: 404 }));
        throw error;
      }
    })();
    requests.set(url, promise);
    return promise;
  };
  const outcomes = new Map<string, number>();
  const weeksByYear = new Map<number, number>();
  for (const row of nfl) {
    if (row.season_type !== "REG" || +row.season < 2016 || +row.season > (recent ? 2026 : 2024)) continue;
    weeksByYear.set(+row.season, Math.max(weeksByYear.get(+row.season) ?? 0, +row.week));
    const points = Number(row.fantasy_points_ppr);
    if (!row.fantasy_points_ppr || !Number.isFinite(points)) throw new Error("Missing NFL fantasy outcome");
    const key = `${row.player_id}:${row.season}`;
    outcomes.set(key, (outcomes.get(key) ?? 0) + points);
  }
  const cohort = draft.filter(r => +r.season >= (recent ? 2023 : 2016) && +r.season <= (recent ? 2026 : 2022) && ["QB", "RB", "WR", "TE"].includes(r.position));
  const rows: unknown[] = [];
  const excluded: unknown[] = [];
  let cursor = 0, completed = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (cursor < cohort.length) {
      const d = cohort[cursor++];
      const identity = { name: d.pfr_player_name, draftYear: +d.season, position: d.position, pick: +d.pick, gsisId: d.gsis_id };
      try {
        const matches = players.filter(p => (d.gsis_id && p.gsis_id === d.gsis_id) || (d.pfr_player_id && p.pfr_id === d.pfr_player_id));
        if (matches.length !== 1 || !matches[0].espn_id || !matches[0].gsis_id) throw new Error("No unique ESPN/GSIS crosswalk");
        const p = matches[0];
        const nflAthlete = z.object({ collegeAthlete: z.object({ $ref: z.string() }).optional() }).parse(await load(`https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/athletes/${p.espn_id}`));
        const collegeId = nflAthlete.collegeAthlete?.$ref.match(/\/college-football\/athletes\/(\d+)/)?.[1] ?? p.espn_id;
        const prospect = prospectSchema.parse({ id: p.gsis_id, name: d.pfr_player_name, school: d.college || p.college_name, position: d.position, draftYear: +d.season, rank: +d.pick, source: "nflverse draft", sourceUrl: sources.draft, asOf: new Date().toISOString().slice(0, 10) });
        const college = await fetchCollegePlayer(prospect, { id: collegeId, displayName: p.display_name, position: { abbreviation: d.position }, school: d.college, teamId: "unknown" }, +d.season - 1, load);
        if (college.seasons.some(s => s.year >= +d.season)) throw new Error("Post-draft feature leakage");
        const model = evaluateCollegePlayer(college, prospect.position);
        if (model.score === null) throw new Error("No qualifying college production");
        const seasonOutcomes = Array.from({ length: 3 }, (_, i) => +d.season + i).filter(year => weeksByYear.has(year)).map(year => ({ year, ppr: outcomes.get(`${p.gsis_id}:${year}`) ?? 0, throughWeek: weeksByYear.get(year)!, complete: weeksByYear.get(year)! >= (year >= 2021 ? 18 : 17) }));
        rows.push({ ...identity, gsisId: p.gsis_id, espnId: collegeId, college, outcome: seasonOutcomes.reduce((n, s) => n + s.ppr, 0), seasonOutcomes });
      } catch (error) { excluded.push({ ...identity, reason: error instanceof Error ? error.message : String(error) }); }
      completed++;
      if (completed % 25 === 0) console.log(`${completed}/${cohort.length}: ${rows.length} usable, ${excluded.length} excluded`);
    }
  }));
  await writeFile(`${directory}/${recent ? "dataset-recent" : "dataset"}.json`, JSON.stringify({ collectedAt: new Date().toISOString(), sources: provenance, cohortSize: cohort.length, rows, excluded }, null, 2));
  console.log(`Saved ${rows.length}/${cohort.length} historical players; exclusions recorded.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
