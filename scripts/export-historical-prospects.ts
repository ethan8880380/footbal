import { readFile, writeFile, mkdir } from "node:fs/promises";
import Papa from "papaparse";
import { createHash } from "node:crypto";
import { collegePlayerSchema } from "../src/lib/domain/college-model";
import { prospectSchema } from "../src/lib/domain/prospects";

async function main() {
  const dataset = JSON.parse(await readFile("data/backtest/dataset.json", "utf8"));
  const recent = JSON.parse(await readFile("data/backtest/dataset-recent.json", "utf8"));
  const identities = Papa.parse<Record<string, string>>(await readFile("data/backtest/players.csv", "utf8"), { header: true, skipEmptyLines: true }).data;
  const players = new Map(identities.map(p => [p.gsis_id, p]));
  const entries = await Promise.all([...dataset.rows, ...recent.rows].map(async (row: { name: string; gsisId: string; draftYear: number; position: string; pick: number; college: unknown; outcome: number; seasonOutcomes: { year: number; ppr: number; complete?: boolean; throughWeek?: number }[] }) => {
    const id = `historical-${row.draftYear}-${row.gsisId}`;
    const college = collegePlayerSchema.parse(row.college);
    if (college.seasons.some(s => s.year >= row.draftYear)) throw new Error("Post-draft college input");
    const identity = players.get(row.gsisId);
    const headshot = identity?.headshot;
    college.prospectId = id;
    const historyUrl = `https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes/${college.athleteId}/stats`;
    try {
      const cached = JSON.parse(await readFile(`data/backtest/responses/${createHash("sha256").update(historyUrl).digest("hex")}.json`, "utf8"));
      const schools = new Map(Object.values(cached.data.teams ?? {}).map(team => { const t = team as { id: string; location: string }; return [t.id, t.location]; }));
      college.seasons.forEach(season => { season.school = schools.get(season.teamId) ?? season.school; });
    } catch { /* Keep source team IDs when historical school metadata is unavailable. */ }
    college.headshot = headshot && /^https:\/\/(static\.www\.nfl\.com|a\.espncdn\.com)\//.test(headshot) ? headshot : college.headshot;
    const prospect = prospectSchema.parse({ id, name: row.name, school: college.school, position: row.position, draftYear: row.draftYear, rank: row.pick, source: "nflverse draft", sourceUrl: "https://github.com/nflverse/nflverse-data/releases/tag/draft_picks", asOf: dataset.collectedAt.slice(0, 10) });
    const seasons = row.seasonOutcomes.map(s => ({ ...s, complete: s.complete ?? true, throughWeek: s.throughWeek ?? (s.year >= 2021 ? 18 : 17) }));
    const complete = seasons.length === 3 && seasons.every(s => s.complete);
    const last = seasons.at(-1);
    return { prospect, college, history: { draftPick: row.pick, nflPpr: row.outcome, seasons, complete, window: complete ? `${row.draftYear}–${row.draftYear + 2}` : last ? `${row.draftYear === last.year ? last.year : `${row.draftYear}–${last.year}`} W${last.throughWeek} · Partial` : "Unavailable", sample: row.draftYear <= 2018 ? "Training" : row.draftYear <= 2020 ? "Validation" : row.draftYear <= 2022 ? "Prior evaluation" : row.draftYear === 2023 ? "Competition evaluation" : "Not used in backtest", nflUrl: identity?.espn_id ? `https://www.espn.com/nfl/player/stats/_/id/${identity.espn_id}` : null } };
  }));
  await mkdir("src/lib/data", { recursive: true });
  await writeFile("src/lib/data/historical-prospects.json", JSON.stringify({ collectedAt: recent.collectedAt, cohortSize: dataset.cohortSize + recent.cohortSize, entries }) + "\n");
  console.log(`Exported ${entries.length} historical profiles`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
