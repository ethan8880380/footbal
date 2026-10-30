import type { WeekEntry } from "./metrics";
import { scoreProjection, statsFromProps, type PropLine } from "./player-props";
import type { ScheduleGame } from "./types";

export const PROJECTION_SOURCES = { props: "Props", sleeper: "Sleeper", model: "Model" } as const;
export type ProjectionSource = keyof typeof PROJECTION_SOURCES;

export const PROJECTION_STATUS = {
  projected: "Projected",
  bye: "Bye",
  out: "Out",
  "no-data": "No data",
  "free-agent": "Free agent",
} as const;
export type ProjectionStatus = keyof typeof PROJECTION_STATUS;

/** Share of a change in team implied points that carries into a player's fantasy output. */
const VEGAS_ELASTICITY: Record<string, number> = { QB: 1, RB: 0.8, WR: 0.9, TE: 0.8, K: 0.6 };
/** Favored backs see more fourth-quarter carries; per point of spread, capped. */
const RB_SCRIPT_PER_POINT = 0.01;
const RB_SCRIPT_CAP = 0.07;
const VEGAS_RANGE = { min: 0.7, max: 1.3 };
const RECENCY_DECAY = 0.85;
/** Weight of last season's points per game, in games. */
const PRIOR_WEIGHT = 2;
const AVAILABILITY: Record<string, number> = { Questionable: 0.85, Doubtful: 0.2 };
const OUT_STATUSES = new Set(["Out", "IR", "PUP", "Sus", "NA", "DNR", "COV"]);

export interface TeamLine {
  gameId: string;
  team: string;
  opponent: string;
  isHome: boolean;
  kickoff: string | null;
  isFinal: boolean;
  /** Team perspective: negative means favored. */
  spread: number | null;
  total: number | null;
  implied: number | null;
}

export interface ProjectionInput {
  /** Every fantasy-eligible position, so a two-way player is scaled as his offensive role. */
  positions: string[];
  /** Played weeks before the projected week. */
  weeks: WeekEntry[];
  priorPpg: number | null;
  hasTeam: boolean;
  line: TeamLine | null;
  injuryStatus: string | null;
  gamesById: Map<string, ScheduleGame>;
  leagueImplied: number | null;
  /** Sleeper's projected stat line for the week, in league scoring keys. */
  sleeperStats: Record<string, number> | null;
  props: PropLine[] | null;
  scoring: Record<string, number>;
}

export interface Projection {
  points: number | null;
  source: ProjectionSource | null;
  stats: Record<string, number> | null;
  form: number | null;
  vegas: number;
  availability: number;
  status: ProjectionStatus;
}

/** Prop lines first, then Sleeper's projection, then recent form scaled by the Vegas team total. */
export function projectPlayer(input: ProjectionInput): Projection {
  const form = recentForm(input.weeks, input.priorPpg);
  const none = { form, vegas: 1, availability: 1, source: null, stats: null };
  if (!input.hasTeam) return { ...none, points: 0, status: "free-agent" };
  if (!input.line) return { ...none, points: 0, status: "bye" };
  if (input.injuryStatus && OUT_STATUSES.has(input.injuryStatus)) return { ...none, points: 0, availability: 0, status: "out" };

  const availability = (input.injuryStatus && AVAILABILITY[input.injuryStatus]) || 1;
  const hasProps = Boolean(input.props?.length);
  if (hasProps || input.sleeperStats) {
    const stats = hasProps ? statsFromProps(input.sleeperStats ?? {}, input.props!, input.positions) : input.sleeperStats!;
    const points = round(scoreProjection(stats, input.scoring) * availability, 1);
    return { points, source: hasProps ? "props" : "sleeper", stats, form, vegas: 1, availability, status: "projected" };
  }
  if (form === null) return { ...none, points: null, status: "no-data" };

  const reference = averageImplied(input.weeks, input.gamesById) ?? input.leagueImplied;
  const vegas = vegasMultiplier(input.positions, input.line, reference);
  return { points: round(form * vegas * availability, 1), source: "model", stats: null, form, vegas, availability, status: "projected" };
}

/** Recency-weighted points per game, shrunk toward last season when there is one. */
export function recentForm(weeks: WeekEntry[], priorPpg: number | null): number | null {
  const played = weeks.filter((e) => e.status === "played" && e.points !== null);
  let weight = priorPpg === null ? 0 : PRIOR_WEIGHT;
  let total = priorPpg === null ? 0 : PRIOR_WEIGHT * priorPpg;
  played.forEach((entry, i) => {
    const w = RECENCY_DECAY ** (played.length - 1 - i);
    weight += w;
    total += w * entry.points!;
  });
  return weight > 0 ? round(total / weight, 2) : null;
}

export function vegasMultiplier(positions: string[], line: TeamLine, reference: number | null): number {
  const elasticity = Math.max(0, ...positions.map((p) => VEGAS_ELASTICITY[p] ?? 0));
  if (!elasticity || line.implied === null || !reference) return 1;
  let multiplier = 1 + elasticity * (line.implied / reference - 1);
  if (positions.includes("RB") && line.spread !== null) multiplier += clamp(-line.spread * RB_SCRIPT_PER_POINT, -RB_SCRIPT_CAP, RB_SCRIPT_CAP);
  return round(clamp(multiplier, VEGAS_RANGE.min, VEGAS_RANGE.max), 3);
}

/** Points the market expects a team to score: half the total, plus half the spread it is favored by. */
export function impliedTotal(game: ScheduleGame, team: string): number | null {
  if (game.spreadLine === null || game.totalLine === null) return null;
  const favoredBy = game.homeTeam === team ? game.spreadLine : -game.spreadLine;
  return round((game.totalLine + favoredBy) / 2, 2);
}

export function teamLine(game: ScheduleGame, team: string): TeamLine {
  const isHome = game.homeTeam === team;
  return {
    gameId: game.gameId,
    team,
    opponent: isHome ? game.awayTeam : game.homeTeam,
    isHome,
    kickoff: kickoffTime(game.gameday, game.gametime)?.toISOString() ?? null,
    isFinal: game.homeScore !== null,
    spread: game.spreadLine === null ? null : isHome ? -game.spreadLine : game.spreadLine,
    total: game.totalLine,
    implied: impliedTotal(game, team),
  };
}

export function leagueAverageImplied(games: ScheduleGame[]): number | null {
  const totals = games.map((g) => g.totalLine).filter((t): t is number => t !== null);
  return totals.length ? round(totals.reduce((a, b) => a + b, 0) / totals.length / 2, 2) : null;
}

/** nflverse kickoff times are US Eastern wall-clock times. */
export function kickoffTime(gameday: string | null, gametime: string | null): Date | null {
  if (!gameday || !gametime) return null;
  const [year, month, day] = gameday.split("-").map(Number);
  const [hour, minute] = gametime.split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  return new Date(wallClock - easternOffsetMinutes(new Date(wallClock)) * 60_000);
}

function averageImplied(weeks: WeekEntry[], gamesById: Map<string, ScheduleGame>) {
  const implied = weeks.flatMap((e) => {
    const game = e.status === "played" && e.gameId && e.team ? gamesById.get(e.gameId) : undefined;
    const value = game ? impliedTotal(game, e.team!) : null;
    return value === null ? [] : [value];
  });
  return implied.length ? implied.reduce((a, b) => a + b, 0) / implied.length : null;
}

const EASTERN = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function easternOffsetMinutes(instant: Date) {
  const parts = Object.fromEntries(EASTERN.formatToParts(instant).map((p) => [p.type, Number(p.value)]));
  const local = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return (local - instant.getTime()) / 60_000;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
