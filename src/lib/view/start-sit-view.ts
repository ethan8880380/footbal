import type { LeagueModel, PlayerAnalysis } from "@/lib/analysis/league-model";
import { solveLineup } from "@/lib/domain/lineup";
import { SLOT_SHORT_LABELS, canFillSlot } from "@/lib/domain/positions";
import { topContributions, type Contribution, type PropLine } from "@/lib/domain/player-props";
import { leagueAverageImplied, projectPlayer, teamLine, type ProjectionSource, type ProjectionStatus, type TeamLine } from "@/lib/domain/projection";
import { toNflverseTeam } from "@/lib/domain/teams";
import type { ScheduleGame } from "@/lib/domain/types";

/** Keeps the current starter when projections tie, so ties never produce a move. */
const INCUMBENT_EDGE = 0.001;

export interface StartSitPlayer {
  playerId: string;
  name: string;
  position: string | null;
  positions: string[];
  team: string | null;
  injury: string | null;
  line: TeamLine | null;
  projection: number | null;
  source: ProjectionSource | null;
  lines: PropLine[];
  contributions: Contribution[];
  form: number | null;
  vegas: number;
  availability: number;
  status: ProjectionStatus;
  isLocked: boolean;
}

export interface StartSitSlot {
  slot: string;
  label: string;
  player: StartSitPlayer | null;
  isChange: boolean;
}

export interface StartSitMove {
  start: StartSitPlayer;
  sit: StartSitPlayer | null;
  gain: number;
}

export interface StartSitView {
  week: number;
  slots: StartSitSlot[];
  moves: StartSitMove[];
  bench: StartSitPlayer[];
  currentTotal: number;
  optimalTotal: number;
  games: number;
  linedGames: number;
  sourceCounts: Record<ProjectionSource, number>;
}

export interface StartSitInput {
  season: number;
  week: number;
  schedule: ScheduleGame[];
  /** Sleeper lineup for the week, in starter-slot order; "0" marks an empty slot. */
  currentStarters: string[] | null;
  projections: { sleeper: Map<string, Record<string, number>>; props: Map<string, PropLine[]> };
  now: Date;
}

export function startSitWeeks(schedule: ScheduleGame[], season: number): number[] {
  return [...new Set(schedule.filter((g) => g.season === season && g.gameType === "REG").map((g) => g.week))].sort((a, b) => a - b);
}

export function buildStartSitView(model: LeagueModel, rosterId: string, input: StartSitInput): StartSitView | null {
  const team = model.teamsById.get(rosterId);
  if (!team) return null;
  const { roster } = team;
  const parked = new Set([...roster.reserve, ...roster.taxi]);
  const active = roster.players.filter((id) => !parked.has(id));

  const regular = input.schedule.filter((g) => g.season === input.season && g.gameType === "REG");
  const weekGames = regular.filter((g) => g.week === input.week);
  const context: ProjectionContext = {
    ...input,
    weekGames,
    gamesById: new Map([...(model.dataset.seasonData?.schedule ?? []), ...input.schedule].map((g) => [g.gameId, g])),
    leagueImplied: leagueAverageImplied(regular),
    sameSeason: model.statsSeason === input.season,
    scoring: model.dataset.league.scoringSettings,
  };
  const players = new Map(active.map((id) => [id, projectRosterPlayer(id, model.players.get(id), context)]));
  const get = (id: string) => players.get(id)!;
  const score = (id: string | null) => (id ? get(id).projection ?? 0 : 0);

  const slots = model.format.starterSlots;
  const sleeperStarters = input.currentStarters?.some((id) => id !== "0") ? input.currentStarters : roster.starters;
  const current = slots.map((_, i) => (players.has(sleeperStarters[i]) ? sleeperStarters[i] : null));
  const currentSet = new Set(current.filter((id): id is string => id !== null));

  const fixed = current.map((id) => (id && get(id).isLocked ? id : null));
  const fixedSet = new Set(fixed.filter((id): id is string => id !== null));
  const open = slots.flatMap((_, i) => (fixed[i] ? [] : [i]));
  const pool = active.filter((id) => !fixedSet.has(id) && !get(id).isLocked);
  const solved = solveLineup(
    open.map((i) => slots[i]),
    pool.map((id) => ({ playerId: id, positions: get(id).positions, score: score(id) + (currentSet.has(id) ? INCUMBENT_EDGE : 0) })),
  );
  const optimal = [...fixed];
  open.forEach((slotIndex, k) => (optimal[slotIndex] = solved.assignments[k].playerId));
  const lineup = keepCurrentSlots(slots, current, optimal, (id) => get(id).positions);
  const lineupSet = new Set(lineup.filter((id): id is string => id !== null));

  const pending = new Set(current.filter((id): id is string => id !== null && !lineupSet.has(id)));
  const moves: StartSitMove[] = [];
  lineup.forEach((start, i) => {
    if (!start || currentSet.has(start)) return;
    const replaced = current[i];
    const sit = replaced && pending.has(replaced) ? replaced : ([...pending][0] ?? null);
    if (sit) pending.delete(sit);
    moves.push({ start: get(start), sit: sit ? get(sit) : null, gain: round(score(start) - score(sit)) });
  });

  return {
    week: input.week,
    slots: slots.map((slot, i) => ({
      slot,
      label: SLOT_SHORT_LABELS[slot] ?? slot,
      player: lineup[i] ? get(lineup[i]) : null,
      isChange: Boolean(lineup[i] && !currentSet.has(lineup[i])),
    })),
    moves,
    bench: active.filter((id) => !lineupSet.has(id)).map(get).sort((a, b) => (b.projection ?? -1) - (a.projection ?? -1)),
    currentTotal: round(current.reduce((total, id) => total + score(id), 0)),
    optimalTotal: round(lineup.reduce((total, id) => total + score(id), 0)),
    games: weekGames.length,
    linedGames: weekGames.filter((g) => g.spreadLine !== null && g.totalLine !== null).length,
    sourceCounts: {
      props: [...players.values()].filter((p) => p.source === "props").length,
      sleeper: [...players.values()].filter((p) => p.source === "sleeper").length,
      model: [...players.values()].filter((p) => p.source === "model").length,
    },
  };
}

interface ProjectionContext extends StartSitInput {
  weekGames: ScheduleGame[];
  gamesById: Map<string, ScheduleGame>;
  leagueImplied: number | null;
  sameSeason: boolean;
  scoring: Record<string, number>;
}

function projectRosterPlayer(playerId: string, info: PlayerAnalysis | undefined, ctx: ProjectionContext): StartSitPlayer {
  const nflTeam = toNflverseTeam(info?.team ?? null);
  const game = nflTeam ? ctx.weekGames.find((g) => g.homeTeam === nflTeam || g.awayTeam === nflTeam) : undefined;
  const line = game && nflTeam ? teamLine(game, nflTeam) : null;
  const injury = info?.player?.injuryStatus ?? null;
  const projection = projectPlayer({
    positions: info?.positions ?? [],
    weeks: ctx.sameSeason ? (info?.weeks ?? []).filter((w) => w.week < ctx.week) : [],
    priorPpg: (ctx.sameSeason ? info?.previous?.pointsPerGame : info?.season?.pointsPerGame) ?? null,
    hasTeam: Boolean(nflTeam),
    line,
    injuryStatus: injury,
    gamesById: ctx.gamesById,
    leagueImplied: ctx.leagueImplied,
    sleeperStats: ctx.projections.sleeper.get(playerId) ?? null,
    props: ctx.projections.props.get(playerId) ?? null,
    scoring: ctx.scoring,
  });
  const kickoff = line?.kickoff ? new Date(line.kickoff) : null;
  return {
    playerId,
    name: info?.name ?? `Player ${playerId}`,
    position: info?.position ?? null,
    positions: info?.positions ?? [],
    team: info?.team ?? null,
    injury,
    line,
    projection: projection.points,
    source: projection.source,
    lines: projection.source === "props" ? ctx.projections.props.get(playerId) ?? [] : [],
    contributions: projection.stats ? topContributions(projection.stats, ctx.scoring) : [],
    form: projection.form,
    vegas: projection.vegas,
    availability: projection.availability,
    status: projection.status,
    isLocked: Boolean(line && (line.isFinal || (kickoff && kickoff <= ctx.now))),
  };
}

/** The solver may shuffle players across flex slots; put incumbents back where they were when eligibility allows. */
function keepCurrentSlots(slots: string[], current: (string | null)[], optimal: (string | null)[], positionsOf: (id: string) => string[]) {
  const result = [...optimal];
  for (let i = 0; i < slots.length; i++) {
    const incumbent = current[i];
    if (!incumbent || result[i] === incumbent) continue;
    const j = result.indexOf(incumbent);
    const displaced = result[i];
    if (j < 0 || !canFillSlot(slots[i], positionsOf(incumbent))) continue;
    if (displaced !== null && !canFillSlot(slots[j], positionsOf(displaced))) continue;
    result[j] = displaced;
    result[i] = incumbent;
  }
  return result;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
