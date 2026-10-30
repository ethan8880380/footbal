import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import { fetchWithRetry } from "../src/lib/http/fetch-with-retry";
import { rateCollegeSchedules, type CollegeGame } from "../src/lib/domain/competition";

const eventSchema = z.object({
  id: z.string(), season: z.object({ year: z.number(), type: z.number().optional() }), seasonType: z.object({ type: z.number() }).optional(),
  competitions: z.array(z.object({
    neutralSite: z.boolean().optional(), status: z.object({ type: z.object({ completed: z.boolean() }) }),
    competitors: z.array(z.object({ homeAway: z.string(), team: z.object({ id: z.string() }), score: z.union([z.string(), z.object({ value: z.number() }).transform(s => String(s.value))]).optional().default("") })),
  })),
});
async function main() {
  await mkdir("data/competition/responses", { recursive: true });
  const jobs = Array.from({ length: 14 }, (_, i) => 2013 + i).flatMap(year => [8, 9, 10, 11, 12].flatMap(month => [80, 81].map(group => ({ year, month, group }))));
  // The postponed 2020 FCS regular season was played in spring 2021.
  jobs.push(...[13, 14, 15, 16, 17].flatMap(month => [80, 81].map(group => ({ year: 2020, month, group }))));
  const games: CollegeGame[] = [];
  const sources: { url: string; sha256: string }[] = [];
  async function load(url: string) {
    const file = `data/competition/responses/${createHash("sha256").update(url).digest("hex")}.json`;
    let raw: string;
    try { raw = await readFile(file, "utf8"); } catch { raw = await (await fetchWithRetry(url)).text(); await writeFile(file, raw); }
    sources.push({ url, sha256: createHash("sha256").update(raw).digest("hex") });
    return JSON.parse(raw);
  }
  function ingest(events: z.infer<typeof eventSchema>[], year: number) {
    for (const e of events) {
      if (e.season.year !== year || (e.seasonType?.type ?? e.season.type) !== 2) continue;
      const c = e.competitions[0];
      if (!c?.status.type.completed) continue;
      const home = c.competitors.find(t => t.homeAway === "home"), away = c.competitors.find(t => t.homeAway === "away");
      if (!home || !away || home.score === "" || away.score === "") continue;
      const homeScore = Number(home.score), awayScore = Number(away.score);
      if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) throw new Error("Invalid completed game score");
      games.push({ id: e.id, year, home: home.team.id, away: away.team.id, homeScore, awayScore, neutral: c.neutralSite ?? false });
    }
  }
  let cursor = 0, completed = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (cursor < jobs.length) {
      const { year, month, group } = jobs[cursor++];
      const mm = String(month > 12 ? month - 12 : month).padStart(2, "0");
      const url = `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=${year + (month > 12 ? 1 : 0)}${mm}&groups=${group}&limit=1000`;
      const file = `data/competition/responses/${createHash("sha256").update(url).digest("hex")}.json`;
      let raw: string;
      try { raw = await readFile(file, "utf8"); } catch { raw = await (await fetchWithRetry(url)).text(); await writeFile(file, raw); }
      const payload = z.object({ events: z.array(z.record(z.string(), z.unknown())) }).parse(JSON.parse(raw));
      // ESPN occasionally emits empty placeholder objects, not games.
      const events = payload.events.filter(event => Object.keys(event).length > 0).map(event => eventSchema.parse(event));
      if (events.length >= 1000) throw new Error(`Potentially truncated scoreboard: ${url}`);
      sources.push({ url, sha256: createHash("sha256").update(raw).digest("hex") });
      for (const e of events) {
        if (e.season.year !== year || (e.seasonType?.type ?? e.season.type) !== 2) continue;
        const c = e.competitions[0];
        if (!c?.status.type.completed) continue;
        const home = c.competitors.find(t => t.homeAway === "home"), away = c.competitors.find(t => t.homeAway === "away");
        if (!home || !away || home.score === "" || away.score === "") continue;
        const homeScore = Number(home.score), awayScore = Number(away.score);
        if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) throw new Error("Invalid completed game score");
        games.push({ id: e.id, year, home: home.team.id, away: away.team.id, homeScore, awayScore, neutral: c.neutralSite ?? false });
      }
      completed++;
      if (completed % 20 === 0) console.log(`${completed}/${jobs.length} scoreboards`);
    }
  }));
  // Recent scoreboard responses silently cap at 25. Team schedules supply the missing games.
  const schedules: { year: number; id: string }[] = [];
  const standings = z.object({ children: z.array(z.unknown()).optional(), standings: z.object({ season: z.number(), entries: z.array(z.object({ team: z.object({ id: z.string() }) })) }).optional() });
  function ids(value: unknown, year: number): string[] {
    const node = standings.parse(value);
    if (node.standings && node.standings.season !== year) throw new Error("Standings season mismatch");
    return [...(node.standings?.entries.map(e => e.team.id) ?? []), ...(node.children ?? []).flatMap(child => ids(child, year))];
  }
  for (const year of [2020, 2024, 2025, 2026]) {
    const teamIds = new Set<string>();
    for (const group of [80, 81]) ids(await load(`https://site.api.espn.com/apis/v2/sports/football/college-football/standings?season=${year}&group=${group}`), year).forEach(id => teamIds.add(id));
    teamIds.forEach(id => schedules.push({ year, id }));
  }
  cursor = 0; completed = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (cursor < schedules.length) {
      const { year, id } = schedules[cursor++];
      const data = await load(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/${id}/schedule?season=${year}&seasontype=2`);
      ingest(z.object({ events: z.array(eventSchema) }).parse(data).events, year);
      completed++;
      if (completed % 100 === 0) console.log(`${completed}/${schedules.length} team schedules`);
    }
  }));
  const seasons = Object.fromEntries(Array.from({ length: 14 }, (_, i) => 2013 + i).map(year => [year, rateCollegeSchedules(games.filter(g => g.year === year))]));
  const collectedAt = new Date().toISOString();
  await writeFile("data/competition/games.json", JSON.stringify([...new Map(games.map(g => [g.id, g])).values()]));
  await writeFile("src/lib/data/college-competition.json", JSON.stringify({ collectedAt, seasons }) + "\n");
  await writeFile("docs/competition-sources.json", JSON.stringify({ collectedAt, sources: sources.sort((a, b) => a.url.localeCompare(b.url)), games: new Set(games.map(g => g.id)).size }, null, 2) + "\n");
  console.log("Saved season-specific opponent strengths");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
