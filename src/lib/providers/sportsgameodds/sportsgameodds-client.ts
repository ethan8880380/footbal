import { z } from "zod";
import { fetchJson } from "@/lib/http/fetch-with-retry";
import { PROP_MARKETS, americanToProbability, type PropLine, type PropMarket } from "@/lib/domain/player-props";

const API = "https://api.sportsgameodds.com/v2";
const MAX_PAGES = 10;

export const SPORTSGAMEODDS = {
  id: "sportsgameodds",
  label: "SportsGameOdds",
  docs: "https://sportsgameodds.com/docs/",
};

export function sportsGameOddsKey() {
  return process.env.SPORTSGAMEODDS_API_KEY?.trim() || null;
}

const oddSchema = z.object({
  statID: z.string(),
  playerID: z.string().nullish(),
  betTypeID: z.string(),
  sideID: z.string(),
  fairOdds: z.string().nullish(),
  bookOdds: z.string().nullish(),
  fairOverUnder: z.string().nullish(),
  bookOverUnder: z.string().nullish(),
});
const teamSchema = z.object({
  teamID: z.string(),
  names: z.object({ short: z.string().nullish(), medium: z.string().nullish(), long: z.string().nullish() }).nullish(),
});
const playerSchema = z.object({
  playerID: z.string(),
  teamID: z.string().nullish(),
  name: z.string().nullish(),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
});
const eventSchema = z.object({
  eventID: z.string(),
  status: z.object({ startsAt: z.string().nullish() }).nullish(),
  teams: z.object({ home: teamSchema, away: teamSchema }),
  players: z.record(z.string(), playerSchema).nullish(),
  odds: z.record(z.string(), oddSchema).nullish(),
});
const pageSchema = z.object({ data: z.array(eventSchema), nextCursor: z.string().nullish() });
type SgoEvent = z.infer<typeof eventSchema>;

export interface EventProps {
  eventId: string;
  startsAt: string | null;
  homeTeam: string;
  awayTeam: string;
  /** `names` holds the display name and the legal name, which differ for nicknames like "Hollywood" Brown. */
  players: { names: string[]; team: string; lines: PropLine[] }[];
}

/** One request per page; the free tier bills each returned game once, regardless of markets. */
export async function fetchNflPlayerProps(apiKey: string, window: { startsAfter: Date; startsBefore: Date }): Promise<EventProps[]> {
  const oddIDs = (Object.keys(PROP_MARKETS) as PropMarket[]).map((m) => (m === "touchdowns" ? `${m}-PLAYER_ID-game-yn-yes` : `${m}-PLAYER_ID-game-ou-over`));
  const events: SgoEvent[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      leagueID: "NFL",
      oddsAvailable: "true",
      oddID: oddIDs.join(","),
      includeOpposingOdds: "true",
      startsAfter: window.startsAfter.toISOString(),
      startsBefore: window.startsBefore.toISOString(),
      limit: "50",
    });
    if (cursor) params.set("cursor", cursor);
    const response = pageSchema.parse(await fetchJson<unknown>(`${API}/events?${params}`, { init: { headers: { "x-api-key": apiKey } } }));
    events.push(...response.data);
    if (!response.nextCursor || response.nextCursor === cursor || response.data.length === 0) break;
    cursor = response.nextCursor;
  }
  return events.map(toEventProps);
}

export function parseEventProps(raw: unknown): EventProps {
  return toEventProps(eventSchema.parse(raw));
}

function toEventProps(event: SgoEvent): EventProps {
  const { home, away } = event.teams;
  const teamCode = (teamID: string | null | undefined) => (teamID === home.teamID ? code(home) : teamID === away.teamID ? code(away) : null);
  const linesByPlayer = new Map<string, PropLine[]>();
  const odds = event.odds ?? {};
  for (const [oddID, odd] of Object.entries(odds)) {
    const line = toPropLine(odd, odds[oddID.replace(/-(over|yes)$/, (_, side) => (side === "over" ? "-under" : "-no"))]);
    if (!line || !odd.playerID) continue;
    linesByPlayer.set(odd.playerID, [...(linesByPlayer.get(odd.playerID) ?? []), line]);
  }
  const players = [...linesByPlayer].flatMap(([playerID, lines]) => {
    const info = event.players?.[playerID];
    const names = [...new Set([info?.name, [info?.firstName, info?.lastName].filter(Boolean).join(" ")].filter((n): n is string => Boolean(n)))];
    const team = teamCode(info?.teamID);
    return names.length && team ? [{ names, team, lines }] : [];
  });
  return { eventId: event.eventID, startsAt: event.status?.startsAt ?? null, homeTeam: code(home), awayTeam: code(away), players };
}

type SgoOdd = z.infer<typeof oddSchema>;

function toPropLine(odd: SgoOdd, opposing: SgoOdd | undefined): PropLine | null {
  if (!(odd.statID in PROP_MARKETS)) return null;
  const market = odd.statID as PropMarket;
  const isYesNo = market === "touchdowns";
  if (isYesNo ? odd.betTypeID !== "yn" || odd.sideID !== "yes" : odd.betTypeID !== "ou" || odd.sideID !== "over") return null;
  const price = Number(odd.fairOdds ?? odd.bookOdds);
  const overProbability = isPriced(odd, opposing) && Number.isFinite(price) && price !== 0 ? americanToProbability(price) : null;
  if (isYesNo || PROP_MARKETS[market].count) {
    if (overProbability === null) return null;
    if (isYesNo) return { market, line: null, overProbability };
  }
  const line = Number(odd.fairOverUnder ?? odd.bookOverUnder);
  return Number.isFinite(line) ? { market, line, overProbability } : null;
}

/** Pick'em boards post even money on one side; the fair price derived from that says nothing about the odds. */
function isPriced(odd: SgoOdd, opposing: SgoOdd | undefined) {
  if (!odd.bookOdds) return false;
  const placeholder = (o: SgoOdd | undefined) => !o?.bookOdds || o.bookOdds === "+100" || o.bookOdds === "100";
  return !(placeholder(odd) && placeholder(opposing));
}

function code(team: z.infer<typeof teamSchema>) {
  return (team.names?.short ?? team.teamID).toUpperCase();
}
