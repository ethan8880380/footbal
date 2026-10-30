import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import Papa from "papaparse";
import { z } from "zod";
import { fetchWithRetry, HttpError } from "../src/lib/http/fetch-with-retry";
import { fetchDefensiveSeasons, type JsonLoader } from "../src/lib/providers/espn-defense";
import { IDP_SCORING, scoreStatLine } from "../src/lib/domain/scoring";

/** Drafted DL/LB/DB, 2016-2026: college defensive seasons from ESPN; first-three-season NFL IDP points from nflverse for classes with complete outcomes (2016-2023). */
const directory = "data/backtest";
const FIRST = 2016, LAST = 2026, LAST_OUTCOME = 2023;
const sources = {
  players: "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv",
  draft: "https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv",
};
const nflWeek = (season: number) => `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`;

async function text(file: string, url: string) {
  try { return await readFile(file, "utf8"); }
  catch { const body = await (await fetchWithRetry(url, { timeoutMs: 120000 })).text(); await writeFile(file, body); return body; }
}
async function csv(file: string, url: string) {
  const parsed = Papa.parse<Record<string, string>>(await text(file, url), { header: true, skipEmptyLines: true });
  if (parsed.errors.length) throw new Error(`Malformed ${file}`);
  return parsed.data;
}

async function main() {
  await mkdir(`${directory}/responses`, { recursive: true });
  await mkdir(`${directory}/defense`, { recursive: true });
  const [players, draft, combine] = await Promise.all([csv(`${directory}/players.csv`, sources.players), csv(`${directory}/draft.csv`, sources.draft), csv(`${directory}/combine.csv`, "")]);
  const outcomes = new Map<string, number>();
  const weeksBySeason = new Map<number, number>();
  for (let season = FIRST; season <= LAST_OUTCOME + 2; season++) {
    for (const row of await csv(`${directory}/defense/stats-${season}.csv`, nflWeek(season))) {
      if (row.season_type !== "REG") continue;
      weeksBySeason.set(season, Math.max(weeksBySeason.get(season) ?? 0, +row.week));
      const stats = Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === "" || value === "NA" ? null : Number(value)]));
      const points = scoreStatLine(stats, null, IDP_SCORING).points;
      outcomes.set(`${row.player_id}:${season}`, (outcomes.get(`${row.player_id}:${season}`) ?? 0) + points);
    }
  }
  for (let season = FIRST; season <= LAST_OUTCOME + 2; season++) if ((weeksBySeason.get(season) ?? 0) < (season >= 2021 ? 18 : 17)) throw new Error(`Incomplete NFL season ${season}`);

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

  const byGsis = new Map(players.filter(p => p.gsis_id).map(p => [p.gsis_id, p]));
  const combineById = new Map(combine.filter(c => c.pfr_id).map(c => [c.pfr_id, c]));
  const cohort = draft.filter(r => +r.season >= FIRST && +r.season <= LAST && r.side === "D" && ["DL", "LB", "DB"].includes(r.category));
  const rows: unknown[] = [], excluded: unknown[] = [];
  let cursor = 0, completed = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (cursor < cohort.length) {
      const d = cohort[cursor++];
      const identity = { name: d.pfr_player_name, draftYear: +d.season, group: d.category, position: d.position, pick: +d.pick, gsisId: d.gsis_id };
      try {
        const p = byGsis.get(d.gsis_id);
        if (!p?.espn_id) throw new Error("No ESPN/GSIS crosswalk");
        const nflAthlete = z.object({ collegeAthlete: z.object({ $ref: z.string() }).optional() }).parse(await load(`https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/athletes/${p.espn_id}`));
        const espnId = nflAthlete.collegeAthlete?.$ref.match(/\/college-football\/athletes\/(\d+)/)?.[1] ?? p.espn_id;
        const seasons = await fetchDefensiveSeasons(espnId, +d.season - 1, load);
        if (seasons.some(s => s.year >= +d.season)) throw new Error("Post-draft feature leakage");
        if (!seasons.length) throw new Error("No college defensive seasons");
        const c = combineById.get(d.pfr_player_id);
        const [feet, inches] = (c?.ht ?? "").split("-").map(Number);
        const seasonOutcomes = [0, 1, 2].map(i => ({ year: +d.season + i, points: outcomes.get(`${d.gsis_id}:${+d.season + i}`) ?? 0 })).filter(s => s.year <= LAST_OUTCOME + 2);
        rows.push({ ...identity, espnId, school: d.college, age: d.age ? +d.age : null, height: c?.ht ? feet * 12 + inches : null, weight: c?.wt ? +c.wt : null, forty: c?.forty ? +c.forty : null, vertical: c?.vertical ? +c.vertical : null, broadJump: c?.broad_jump ? +c.broad_jump : null, college: seasons, outcome: +d.season <= LAST_OUTCOME ? seasonOutcomes.reduce((n, s) => n + s.points, 0) : null, seasonOutcomes });
      } catch (error) { excluded.push({ ...identity, reason: error instanceof Error ? error.message : String(error) }); }
      if (++completed % 50 === 0) console.log(`${completed}/${cohort.length}: ${rows.length} usable, ${excluded.length} excluded`);
    }
  }));
  await writeFile(`${directory}/defense-dataset.json`, JSON.stringify({ collectedAt: new Date().toISOString(), scoring: IDP_SCORING, cohortSize: cohort.length, rows, excluded }));
  console.log(`Saved ${rows.length}/${cohort.length} defenders.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
