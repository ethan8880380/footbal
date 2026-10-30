import { scoreStatLine, type ScoringSupport } from "./scoring";
import type {
  Evidence,
  ScheduleGame,
  SnapWeekRecord,
  StatLine,
  StatWeekRecord,
  TeamGameTotals,
} from "./types";

export const NFLVERSE_STATS_URL = (season: number) =>
  `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`;
export const NFLVERSE_SNAPS_URL = (season: number) =>
  `https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_${season}.csv`;

export const RECENT_WINDOW_GAMES = 4;

export type WeekStatus = "played" | "bye" | "inactive" | "missing" | "upcoming";

export const WEEK_STATUS_LABELS: Record<WeekStatus, string> = {
  played: "Played",
  bye: "Bye",
  inactive: "Did not play",
  missing: "No record",
  upcoming: "Not yet played",
};

export interface WeekEntry {
  week: number;
  team: string | null;
  gameId: string | null;
  gameday: string | null;
  status: WeekStatus;
  stats: StatLine | null;
  offenseSnaps: number | null;
  defenseSnaps: number | null;
  teamTotals: TeamGameTotals | null;
  points: number | null;
}

export interface SeasonData {
  season: number;
  schedule: ScheduleGame[];
  statWeeks: StatWeekRecord[];
  snapWeeks: SnapWeekRecord[];
  teamTotals: Map<string, TeamGameTotals>;
  retrievedAt: string | null;
}

export interface MetricPlayer {
  playerId: string;
  position: string | null;
  currentTeam: string | null;
  gsisId: string | null;
  pfrId: string | null;
}

export function teamTotalsKey(gameId: string, team: string) {
  return `${gameId}|${team}`;
}

export function buildWeekLog(
  player: MetricPlayer,
  data: SeasonData,
  scoring: { settings: Record<string, number>; support: ScoringSupport },
): WeekEntry[] {
  const regular = data.schedule.filter((g) => g.gameType === "REG" && g.season === data.season);
  if (regular.length === 0) return [];
  const maxWeek = Math.max(...regular.map((g) => g.week));
  const gameByTeamWeek = new Map<string, ScheduleGame>();
  for (const game of regular) {
    gameByTeamWeek.set(`${game.homeTeam}|${game.week}`, game);
    gameByTeamWeek.set(`${game.awayTeam}|${game.week}`, game);
  }

  const statsByWeek = new Map<number, StatWeekRecord>();
  if (player.gsisId) {
    for (const row of data.statWeeks) {
      if (row.gsisId === player.gsisId && row.seasonType === "REG") statsByWeek.set(row.week, row);
    }
  }
  const snapsByWeek = new Map<number, SnapWeekRecord>();
  if (player.pfrId) {
    for (const row of data.snapWeeks) if (row.pfrId === player.pfrId) snapsByWeek.set(row.week, row);
  }

  const teamByWeek = resolveTeamTimeline(maxWeek, statsByWeek, snapsByWeek, player.currentTeam);

  const entries: WeekEntry[] = [];
  for (let week = 1; week <= maxWeek; week++) {
    const team = teamByWeek[week] ?? null;
    const game = team ? gameByTeamWeek.get(`${team}|${week}`) : undefined;
    const statRow = statsByWeek.get(week) ?? null;
    const snapRow = snapsByWeek.get(week) ?? null;
    const base = {
      week,
      team,
      gameId: game?.gameId ?? statRow?.gameId ?? null,
      gameday: game?.gameday ?? null,
      offenseSnaps: snapRow?.offenseSnaps ?? null,
      defenseSnaps: snapRow?.defenseSnaps ?? null,
    };
    const totals = base.gameId && team ? data.teamTotals.get(teamTotalsKey(base.gameId, team)) ?? null : null;

    if (!game && !statRow) {
      entries.push({ ...base, status: team ? "bye" : "missing", stats: null, teamTotals: null, points: null });
      continue;
    }
    if (game && game.homeScore === null && !statRow) {
      entries.push({ ...base, status: "upcoming", stats: null, teamTotals: null, points: null });
      continue;
    }

    const tookSnaps = snapRow !== null && [snapRow.offenseSnaps, snapRow.defenseSnaps, snapRow.stSnaps].some((n) => (n ?? 0) > 0);
    if (statRow || tookSnaps) {
      const stats = statRow?.stats ?? {};
      const points = scoreStatLine(stats, player.position, scoring.settings, scoring.support).points;
      entries.push({ ...base, status: "played", stats, teamTotals: totals, points });
    } else if (totals?.hasSnapCoverage && player.pfrId) {
      entries.push({ ...base, status: "inactive", stats: null, teamTotals: totals, points: null });
    } else {
      entries.push({ ...base, status: "missing", stats: null, teamTotals: totals, points: null });
    }
  }
  return entries;
}

function resolveTeamTimeline(
  maxWeek: number,
  stats: Map<number, StatWeekRecord>,
  snaps: Map<number, SnapWeekRecord>,
  currentTeam: string | null,
) {
  const known: (string | undefined)[] = [];
  for (let week = 1; week <= maxWeek; week++) known[week] = stats.get(week)?.team ?? snaps.get(week)?.team;
  const resolved: (string | undefined)[] = [];
  let last: string | undefined;
  for (let week = 1; week <= maxWeek; week++) {
    if (known[week]) last = known[week];
    resolved[week] = known[week] ?? last;
  }
  let next: string | undefined = currentTeam ?? undefined;
  for (let week = maxWeek; week >= 1; week--) {
    if (known[week]) next = known[week];
    resolved[week] ??= next;
  }
  return resolved;
}

export interface Ratio {
  value: number | null;
  numerator: number | null;
  denominator: number | null;
}

export interface WindowSummary {
  key: "season" | "recent";
  label: string;
  weekStart: number | null;
  weekEnd: number | null;
  teamGames: number;
  gamesPlayed: number;
  inactive: number;
  missing: number;
  byes: number;
  totals: Record<string, number> | null;
  points: number | null;
  pointsPerGame: number | null;
  team: {
    targets: number;
    carries: number;
    airYards: number;
    offenseSnaps: number;
    defenseSnaps: number;
  };
  snapsOffense: number | null;
  snapsDefense: number | null;
  dataCutoff: string | null;
}

export function summarizeWindow(entries: WeekEntry[], key: WindowSummary["key"]): WindowSummary {
  const completed = entries.filter((e) => e.status !== "upcoming");
  const teamGameEntries = completed.filter((e) => e.status !== "bye");
  const windowEntries = key === "recent" ? teamGameEntries.slice(-RECENT_WINDOW_GAMES) : completed;
  const played = windowEntries.filter((e) => e.status === "played");
  const weeks = windowEntries.map((e) => e.week);

  const totals = played.length ? sumStats(played.map((e) => e.stats ?? {})) : null;
  const points = played.length ? round(played.reduce((total, e) => total + (e.points ?? 0), 0)) : null;

  const withSnaps = played.filter((e) => e.teamTotals?.hasSnapCoverage && (e.offenseSnaps !== null || e.defenseSnaps !== null));
  const team = {
    targets: sumBy(played, (e) => e.teamTotals?.targets),
    carries: sumBy(played, (e) => e.teamTotals?.carries),
    airYards: sumBy(played, (e) => e.teamTotals?.airYards),
    offenseSnaps: sumBy(withSnaps, (e) => e.teamTotals?.offenseSnaps),
    defenseSnaps: sumBy(withSnaps, (e) => e.teamTotals?.defenseSnaps),
  };
  const lastPlayedDate = [...windowEntries].reverse().find((e) => e.gameday)?.gameday ?? null;

  return {
    key,
    label: key === "season" ? "Season to date" : `Last ${Math.min(RECENT_WINDOW_GAMES, teamGameEntries.length)} team games`,
    weekStart: weeks.length ? Math.min(...weeks) : null,
    weekEnd: weeks.length ? Math.max(...weeks) : null,
    teamGames: windowEntries.filter((e) => e.status !== "bye").length,
    gamesPlayed: played.length,
    inactive: windowEntries.filter((e) => e.status === "inactive").length,
    missing: windowEntries.filter((e) => e.status === "missing").length,
    byes: windowEntries.filter((e) => e.status === "bye").length,
    totals,
    points,
    pointsPerGame: points !== null && played.length ? round(points / played.length) : null,
    team,
    snapsOffense: withSnaps.length ? sumBy(withSnaps, (e) => e.offenseSnaps) : null,
    snapsDefense: withSnaps.length ? sumBy(withSnaps, (e) => e.defenseSnaps) : null,
    dataCutoff: lastPlayedDate,
  };
}

export function ratio(numerator: number | null | undefined, denominator: number | null | undefined): Ratio {
  if (numerator == null || denominator == null || denominator === 0) {
    return { value: null, numerator: numerator ?? null, denominator: denominator ?? null };
  }
  return { value: numerator / denominator, numerator, denominator };
}

function sumStats(lines: StatLine[]) {
  const totals: Record<string, number> = {};
  for (const line of lines) {
    for (const [column, value] of Object.entries(line)) {
      if (value === null || column === "passing_cpoe") continue;
      totals[column] = (totals[column] ?? 0) + value;
    }
  }
  const cpoeWeighted = lines.reduce<{ sum: number; attempts: number }>(
    (acc, line) => {
      const cpoe = line.passing_cpoe;
      const attempts = line.attempts ?? 0;
      if (cpoe === null || cpoe === undefined || attempts === 0) return acc;
      return { sum: acc.sum + cpoe * attempts, attempts: acc.attempts + attempts };
    },
    { sum: 0, attempts: 0 },
  );
  if (cpoeWeighted.attempts > 0) totals.passing_cpoe_weighted = cpoeWeighted.sum / cpoeWeighted.attempts;
  return totals;
}

function sumBy<T>(items: T[], pick: (item: T) => number | null | undefined) {
  return items.reduce((total, item) => total + (pick(item) ?? 0), 0);
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

interface MetricDefinition {
  key: string;
  label: string;
  units: string;
  positions: string[] | "all";
  kind: Evidence["kind"];
  definition: string;
  denominator: string | null;
  compute: (w: WindowSummary) => number | null;
}

const OFFENSE = ["QB", "RB", "WR", "TE"];
const RECEIVERS = ["RB", "WR", "TE"];
const IDP = ["DL", "LB", "DB"];

function total(column: string) {
  return (w: WindowSummary) => (w.totals ? w.totals[column] ?? 0 : null);
}

function perGame(column: string) {
  return (w: WindowSummary) => (w.totals && w.gamesPlayed ? round((w.totals[column] ?? 0) / w.gamesPlayed, 1) : null);
}

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    key: "games_played", label: "Games played", units: "games", positions: "all", kind: "observed",
    definition: "Team games with a stat record or at least one snap.", denominator: "Completed team games in window",
    compute: (w) => w.gamesPlayed,
  },
  {
    key: "fantasy_ppg", label: "Points per game", units: "pts/game", positions: "all", kind: "calculated",
    definition: "League scoring applied to nflverse per-game stats, divided by games played.", denominator: "Games played",
    compute: (w) => w.pointsPerGame,
  },
  {
    key: "fantasy_points", label: "Fantasy points", units: "pts", positions: "all", kind: "calculated",
    definition: "League scoring applied to nflverse per-game stats.", denominator: null,
    compute: (w) => w.points,
  },
  {
    key: "offense_snap_share", label: "Offensive snap share", units: "%", positions: OFFENSE, kind: "calculated",
    definition: "Player offensive snaps divided by team offensive snaps in games he played (PFR snap counts).",
    denominator: "Team offensive snaps in games played",
    compute: (w) => pct(ratio(w.snapsOffense, w.team.offenseSnaps).value),
  },
  {
    key: "targets", label: "Targets", units: "targets", positions: RECEIVERS, kind: "observed",
    definition: "Pass targets.", denominator: null, compute: total("targets"),
  },
  {
    key: "target_share", label: "Target share", units: "%", positions: RECEIVERS, kind: "calculated",
    definition: "Player targets divided by team targets, summed over games played.", denominator: "Team targets in games played",
    compute: (w) => pct(ratio(w.totals?.targets, w.team.targets).value),
  },
  {
    key: "air_yards_share", label: "Air yards share", units: "%", positions: ["WR", "TE"], kind: "calculated",
    definition: "Player air yards divided by team air yards, summed over games played.", denominator: "Team air yards in games played",
    compute: (w) => pct(ratio(w.totals?.receiving_air_yards, w.team.airYards).value),
  },
  {
    key: "adot", label: "Average depth of target", units: "yds", positions: ["WR", "TE"], kind: "calculated",
    definition: "Receiving air yards divided by targets (includes incompletions).", denominator: "Targets",
    compute: (w) => round1(ratio(w.totals?.receiving_air_yards, w.totals?.targets).value),
  },
  {
    key: "receptions", label: "Receptions", units: "rec", positions: RECEIVERS, kind: "observed",
    definition: "Catches.", denominator: null, compute: total("receptions"),
  },
  {
    key: "receiving_yards", label: "Receiving yards", units: "yds", positions: RECEIVERS, kind: "observed",
    definition: "Receiving yards.", denominator: null, compute: total("receiving_yards"),
  },
  {
    key: "yards_per_target", label: "Yards per target", units: "yds", positions: ["WR", "TE"], kind: "calculated",
    definition: "Receiving yards divided by targets.", denominator: "Targets",
    compute: (w) => round1(ratio(w.totals?.receiving_yards, w.totals?.targets).value),
  },
  {
    key: "yac_per_reception", label: "Yards after catch per reception", units: "yds", positions: RECEIVERS, kind: "calculated",
    definition: "Receiving yards after catch divided by receptions.", denominator: "Receptions",
    compute: (w) => round1(ratio(w.totals?.receiving_yards_after_catch, w.totals?.receptions).value),
  },
  {
    key: "receiving_tds", label: "Receiving TDs", units: "TD", positions: RECEIVERS, kind: "observed",
    definition: "Receiving touchdowns.", denominator: null, compute: total("receiving_tds"),
  },
  {
    key: "carries", label: "Carries", units: "att", positions: ["QB", "RB", "WR"], kind: "observed",
    definition: "Rushing attempts.", denominator: null, compute: total("carries"),
  },
  {
    key: "carry_share", label: "Carry share", units: "%", positions: ["RB"], kind: "calculated",
    definition: "Player carries divided by team carries, summed over games played.", denominator: "Team carries in games played",
    compute: (w) => pct(ratio(w.totals?.carries, w.team.carries).value),
  },
  {
    key: "touches_per_game", label: "Touches per game", units: "touches", positions: ["RB"], kind: "calculated",
    definition: "Carries plus receptions, divided by games played.", denominator: "Games played",
    compute: (w) => (w.totals && w.gamesPlayed ? round(((w.totals.carries ?? 0) + (w.totals.receptions ?? 0)) / w.gamesPlayed, 1) : null),
  },
  {
    key: "rushing_yards", label: "Rushing yards", units: "yds", positions: ["QB", "RB"], kind: "observed",
    definition: "Rushing yards.", denominator: null, compute: total("rushing_yards"),
  },
  {
    key: "yards_per_carry", label: "Yards per carry", units: "yds", positions: ["RB"], kind: "calculated",
    definition: "Rushing yards divided by carries.", denominator: "Carries",
    compute: (w) => round1(ratio(w.totals?.rushing_yards, w.totals?.carries).value),
  },
  {
    key: "rushing_tds", label: "Rushing TDs", units: "TD", positions: ["QB", "RB"], kind: "observed",
    definition: "Rushing touchdowns.", denominator: null, compute: total("rushing_tds"),
  },
  {
    key: "pass_attempts_per_game", label: "Pass attempts per game", units: "att", positions: ["QB"], kind: "calculated",
    definition: "Pass attempts divided by games played.", denominator: "Games played", compute: perGame("attempts"),
  },
  {
    key: "passing_yards", label: "Passing yards", units: "yds", positions: ["QB"], kind: "observed",
    definition: "Passing yards.", denominator: null, compute: total("passing_yards"),
  },
  {
    key: "passing_tds", label: "Passing TDs", units: "TD", positions: ["QB"], kind: "observed",
    definition: "Passing touchdowns.", denominator: null, compute: total("passing_tds"),
  },
  {
    key: "interceptions", label: "Interceptions", units: "INT", positions: ["QB"], kind: "observed",
    definition: "Interceptions thrown.", denominator: null, compute: total("passing_interceptions"),
  },
  {
    key: "yards_per_attempt", label: "Yards per attempt", units: "yds", positions: ["QB"], kind: "calculated",
    definition: "Passing yards divided by pass attempts.", denominator: "Pass attempts",
    compute: (w) => round1(ratio(w.totals?.passing_yards, w.totals?.attempts).value),
  },
  {
    key: "epa_per_dropback", label: "Passing EPA per dropback", units: "EPA", positions: ["QB"], kind: "calculated",
    definition: "nflverse passing EPA divided by pass attempts plus sacks.", denominator: "Attempts + sacks",
    compute: (w) =>
      w.totals ? round(ratio(w.totals.passing_epa, (w.totals.attempts ?? 0) + (w.totals.sacks_suffered ?? 0)).value ?? NaN) : null,
  },
  {
    key: "cpoe", label: "CPOE", units: "%", positions: ["QB"], kind: "calculated",
    definition: "Completion percentage over expected, weighted by attempts across games.", denominator: "Pass attempts",
    compute: (w) => (w.totals?.passing_cpoe_weighted === undefined ? null : round1(w.totals.passing_cpoe_weighted)),
  },
  {
    key: "defense_snap_share", label: "Defensive snap share", units: "%", positions: IDP, kind: "calculated",
    definition: "Player defensive snaps divided by team defensive snaps in games he played (PFR snap counts).",
    denominator: "Team defensive snaps in games played",
    compute: (w) => pct(ratio(w.snapsDefense, w.team.defenseSnaps).value),
  },
  {
    key: "tackles_solo", label: "Solo tackles", units: "tkl", positions: IDP, kind: "observed",
    definition: "Solo tackles.", denominator: null, compute: total("def_tackles_solo"),
  },
  {
    key: "tackle_assists", label: "Assisted tackles", units: "tkl", positions: IDP, kind: "observed",
    definition: "Tackle assists.", denominator: null, compute: total("def_tackle_assists"),
  },
  {
    key: "tackles_for_loss", label: "Tackles for loss", units: "tkl", positions: IDP, kind: "observed",
    definition: "Tackles for loss.", denominator: null, compute: total("def_tackles_for_loss"),
  },
  {
    key: "sacks", label: "Sacks", units: "sacks", positions: IDP, kind: "observed",
    definition: "Sacks.", denominator: null, compute: total("def_sacks"),
  },
  {
    key: "qb_hits", label: "QB hits", units: "hits", positions: IDP, kind: "observed",
    definition: "QB hits (pressure proxy; pressures are not in this dataset).", denominator: null, compute: total("def_qb_hits"),
  },
  {
    key: "passes_defended", label: "Passes defended", units: "PD", positions: IDP, kind: "observed",
    definition: "Passes defended.", denominator: null, compute: total("def_pass_defended"),
  },
  {
    key: "def_interceptions", label: "Interceptions", units: "INT", positions: IDP, kind: "observed",
    definition: "Interceptions.", denominator: null, compute: total("def_interceptions"),
  },
];

/** Metrics that are commonly requested but not available from connected sources. */
export const UNAVAILABLE_METRICS: Record<string, { label: string; reason: string }[]> = {
  WR: [
    { label: "Routes run, TPRR, YPRR", reason: "nflverse participation data is published after the postseason; no in-season route feed is connected." },
  ],
  TE: [
    { label: "Routes run, TPRR, YPRR", reason: "nflverse participation data is published after the postseason; no in-season route feed is connected." },
  ],
  RB: [
    { label: "Red-zone and goal-line carries", reason: "Requires play-by-play ingestion, which is not connected." },
    { label: "Routes run", reason: "No in-season route feed is connected." },
  ],
  QB: [{ label: "Designed runs vs scrambles", reason: "Requires play-by-play ingestion, which is not connected." }],
  DL: [{ label: "Pressures and pass-rush win rate", reason: "No charting source is connected." }],
  LB: [{ label: "Pressures and coverage snaps", reason: "No charting source is connected." }],
  DB: [{ label: "Coverage snaps and targets allowed", reason: "No charting source is connected." }],
};

function pct(value: number | null) {
  return value === null ? null : round(value * 100, 1);
}

function round1(value: number | null) {
  return value === null || Number.isNaN(value) ? null : round(value, 1);
}

export function metricsForPosition(position: string | null) {
  return METRIC_DEFINITIONS.filter((m) => m.positions === "all" || (position !== null && m.positions.includes(position)));
}

export function buildMetricEvidence(
  playerId: string,
  position: string | null,
  season: number,
  window: WindowSummary,
  retrievedAt: string | null,
): Evidence[] {
  return metricsForPosition(position).map((metric) => {
    const value = window.gamesPlayed === 0 && metric.key !== "games_played" ? null : metric.compute(window);
    const usesSnaps = metric.key.includes("snap");
    return {
      id: `nflverse:${metric.key}:${playerId}:${season}:${window.key}`,
      playerId,
      metricKey: metric.key,
      label: metric.label,
      value: value === null || Number.isNaN(value) ? null : value,
      units: metric.units,
      provider: usesSnaps ? "nflverse (PFR snap counts)" : "nflverse player stats",
      sourceUrl: usesSnaps ? NFLVERSE_SNAPS_URL(season) : NFLVERSE_STATS_URL(season),
      season,
      weekStart: window.weekStart,
      weekEnd: window.weekEnd,
      dateRange: null,
      sampleSize: window.gamesPlayed,
      sampleUnit: "games played",
      definition: metric.definition,
      denominator: metric.denominator,
      dataCutoff: window.dataCutoff,
      retrievedAt,
      kind: metric.kind,
    };
  });
}
