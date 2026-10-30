import { readFile, writeFile } from "node:fs/promises";
import Papa from "papaparse";
import { collegePlayerSchema, type CollegePlayer } from "../src/lib/domain/college-model";
import { prospectSchema } from "../src/lib/domain/prospects";
import type { DefensiveSeason } from "../src/lib/domain/defense-model";

/** Packages drafted defenders (2016-2026) in the same entry shape as historical offensive prospects. */
interface Row { name: string; draftYear: number; group: "DL" | "LB" | "DB"; pick: number; gsisId: string; espnId: string; school: string; height: number | null; weight: number | null; college: DefensiveSeason[]; outcome: number | null; seasonOutcomes: { year: number; points: number }[] }
export const GAMELOG = (athleteId: string, year: number) => `https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes/${athleteId}/gamelog?season=${year}`;
export function defensePlayer(id: string, athleteId: string, name: string, school: string, group: "DL" | "LB" | "DB", height: number | null, weight: number | null, seasons: DefensiveSeason[], headshot: string | null): CollegePlayer {
  return collegePlayerSchema.parse({
    prospectId: id, athleteId, name, school, position: group, headshot,
    height: height ? `${Math.floor(height / 12)}' ${height % 12}"` : "", weight,
    seasons: seasons.map(s => ({ year: s.year, teamId: "", school, games: s.games, receptions: null, receivingYards: null, receivingTD: null, carries: null, rushingYards: null, rushingTD: null, attempts: null, completions: null, passingYards: null, passingTD: null, interceptions: null, teamPassingYards: null, teamRushingYards: null, teamPassingTD: null, sourceUrl: GAMELOG(athleteId, s.year), teamSourceUrl: null, defense: { tackles: s.tackles, solo: s.solo, assists: s.assists, sacks: s.sacks, forcedFumbles: s.forcedFumbles, interceptions: s.interceptions, passesDefended: s.passesDefended } })),
    fetchedAt: new Date().toISOString(), sourceUrl: `https://www.espn.com/college-football/player/stats/_/id/${athleteId}`,
  });
}
async function main() {
  const dataset = JSON.parse(await readFile("data/backtest/defense-dataset.json", "utf8")) as { collectedAt: string; rows: Row[] };
  const identities = new Map(Papa.parse<Record<string, string>>(await readFile("data/backtest/players.csv", "utf8"), { header: true, skipEmptyLines: true }).data.map(p => [p.gsis_id, p]));
  const entries = dataset.rows.map(row => {
    const id = `defense-${row.draftYear}-${row.gsisId}`, identity = identities.get(row.gsisId), headshot = identity?.headshot;
    const college = defensePlayer(id, row.espnId, row.name, row.school, row.group, row.height, row.weight, row.college, headshot && /^https:\/\/(static\.www\.nfl\.com|a\.espncdn\.com)\//.test(headshot) ? headshot : null);
    if (college.seasons.some(s => s.year >= row.draftYear)) throw new Error("Post-draft college input");
    const prospect = prospectSchema.parse({ id, name: row.name, school: row.school, position: row.group, draftYear: row.draftYear, rank: row.pick, source: "nflverse draft", sourceUrl: "https://github.com/nflverse/nflverse-data/releases/tag/draft_picks", asOf: dataset.collectedAt.slice(0, 10) });
    const seasons = row.seasonOutcomes.map(s => ({ year: s.year, ppr: s.points, complete: true, throughWeek: s.year >= 2021 ? 18 : 17 }));
    const complete = seasons.length === 3;
    const last = seasons.at(-1);
    return { prospect, college, history: { draftPick: row.pick, nflPpr: seasons.reduce((n, s) => n + s.ppr, 0), seasons, complete, window: complete ? `${row.draftYear}–${row.draftYear + 2}` : last ? `${row.draftYear}–${last.year} · Partial` : "Unavailable", sample: row.draftYear <= 2023 ? "Defense backtest" : "Not used in backtest", nflUrl: identity?.espn_id ? `https://www.espn.com/nfl/player/stats/_/id/${identity.espn_id}` : null } };
  });
  const existing = await readFile("src/lib/data/defense-prospects.json", "utf8").then(t => JSON.parse(t) as { current?: unknown[] }).catch(() => ({ current: [] }));
  await writeFile("src/lib/data/defense-prospects.json", JSON.stringify({ collectedAt: dataset.collectedAt, entries, current: existing.current ?? [] }) + "\n");
  console.log(`Exported ${entries.length} drafted defenders`);
}
if (process.argv[1]?.endsWith("export-defense-prospects.ts")) main().catch(error => { console.error(error); process.exitCode = 1; });
