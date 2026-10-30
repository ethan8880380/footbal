import { z } from "zod";
import { HttpError } from "@/lib/http/fetch-with-retry";
import type { DefensiveSeason } from "@/lib/domain/defense-model";

const COMMON = "https://site.web.api.espn.com/apis/common/v3/sports/football/college-football";
export type JsonLoader = (url: string) => Promise<unknown>;


const gamelog = z.object({
  names: z.array(z.string()),
  filters: z.array(z.object({ name: z.string(), value: z.string(), options: z.array(z.object({ value: z.string() })).optional() })),
  seasonTypes: z.array(z.object({ categories: z.array(z.object({ splitType: z.string().optional(), totals: z.array(z.string()).optional(), events: z.array(z.object({ eventId: z.string() })).optional() })) })),
});
const number = (value: string | undefined) => { const n = Number(value?.replaceAll(",", "")); return Number.isFinite(n) ? n : 0; };

/** Regular-season defensive totals and games from the ESPN game log; seasons without a log are skipped, never zero-filled. */
export async function fetchDefensiveSeasons(athleteId: string, lastYear: number, load: JsonLoader, seasonsBack = 3): Promise<DefensiveSeason[]> {
  const seasons: DefensiveSeason[] = [];
  for (let year = lastYear; year > lastYear - seasonsBack; year--) {
    let log: z.infer<typeof gamelog>;
    try { log = gamelog.parse(await load(`${COMMON}/athletes/${athleteId}/gamelog?season=${year}`)); }
    catch (error) { if (error instanceof HttpError && (error.status === 404 || error.status === 500)) continue; throw error; }
    if (!log.filters.some(f => f.name === "season" && f.value === String(year))) continue;
    const regular = log.seasonTypes.flatMap(t => t.categories.filter(c => c.splitType === "2"));
    if (regular.length !== 1 || !regular[0].totals) continue;
    const games = new Set((regular[0].events ?? []).map(e => e.eventId)).size;
    if (!games) continue;
    const at = (name: string) => number(regular[0].totals![log.names.indexOf(name)]);
    seasons.push({ year, games, tackles: at("totalTackles"), solo: at("soloTackles"), assists: at("assistTackles"), sacks: at("sacks"), forcedFumbles: at("fumblesForced"), interceptions: at("interceptions"), passesDefended: at("passesDefended") });
  }
  return seasons;
}
