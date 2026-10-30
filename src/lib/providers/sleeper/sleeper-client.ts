import { z } from "zod";
import { fetchJson } from "@/lib/http/fetch-with-retry";
import {
  draftSchema,
  leagueSchema,
  leagueUserSchema,
  nflStateSchema,
  rosterSchema,
  sleeperPlayerSchema,
  sleeperUserSchema,
  tradedPickSchema,
  type SleeperPlayer,
} from "./schemas";

export const SLEEPER_API = "https://api.sleeper.app/v1";
export const SLEEPER_DOCS = "https://docs.sleeper.com/";

async function get<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> {
  const data = await fetchJson<unknown>(`${SLEEPER_API}${path}`);
  return schema.parse(data);
}

export const sleeperClient = {
  id: "sleeper",
  label: "Sleeper",
  getNflState: () => get("/state/nfl", nflStateSchema),
  getUser: (username: string) => get(`/user/${encodeURIComponent(username.trim())}`, sleeperUserSchema.nullable()),
  getUserLeagues: (userId: string, season: string) =>
    get(`/user/${userId}/leagues/nfl/${season}`, z.array(leagueSchema).nullable().transform((v) => v ?? [])),
  getLeague: (leagueId: string) => get(`/league/${leagueId}`, leagueSchema),
  getRosters: (leagueId: string) => get(`/league/${leagueId}/rosters`, z.array(rosterSchema)),
  getLeagueUsers: (leagueId: string) => get(`/league/${leagueId}/users`, z.array(leagueUserSchema)),
  getDrafts: (leagueId: string) => get(`/league/${leagueId}/drafts`, z.array(draftSchema)),
  getTradedPicks: (leagueId: string) => get(`/league/${leagueId}/traded_picks`, z.array(tradedPickSchema)),
  getDraftTradedPicks: (draftId: string) => get(`/draft/${draftId}/traded_picks`, z.array(tradedPickSchema)),
  getDraft: (draftId: string) => get(`/draft/${draftId}`, draftSchema),
  /** About 5 MB. Callers must cache this and refresh at most daily. */
  async getPlayers(): Promise<Map<string, SleeperPlayer>> {
    const data = await fetchJson<Record<string, unknown>>(`${SLEEPER_API}/players/nfl`, { timeoutMs: 120_000 });
    const players = new Map<string, SleeperPlayer>();
    for (const [playerId, raw] of Object.entries(data)) {
      const parsed = sleeperPlayerSchema.safeParse(raw);
      if (parsed.success) players.set(playerId, parsed.data);
    }
    return players;
  },
};

export type SleeperClient = typeof sleeperClient;

/**
 * Sleeper's `season` is the season being played; `league_season` is the season
 * new leagues belong to. In the offseason the two diverge.
 */
export function resolveSeasons(state: { season: string; league_season: string; season_type: string; previous_season?: string | null; week: number }) {
  const inSeason = state.season_type === "regular" || state.season_type === "post";
  const previous = Number(state.previous_season ?? Number(state.season) - 1);
  const leagueSeasons = [...new Set([state.league_season, state.season, String(previous)])].sort().reverse();
  return { statsSeason: inSeason ? Number(state.season) : previous, defaultLeagueSeason: state.league_season, leagueSeasons };
}
