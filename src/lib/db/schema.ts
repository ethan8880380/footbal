import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import type { PropLine } from "@/lib/domain/player-props";

const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();

export const sleeperUsers = sqliteTable("sleeper_users", {
  userId: text("user_id").primaryKey(),
  username: text("username").notNull(),
  displayName: text("display_name"),
  avatar: text("avatar"),
  retrievedAt: text("retrieved_at").notNull(),
});

export const leagues = sqliteTable("leagues", {
  leagueId: text("league_id").primaryKey(),
  name: text("name").notNull(),
  season: text("season").notNull(),
  status: text("status"),
  totalRosters: integer("total_rosters"),
  previousLeagueId: text("previous_league_id"),
  draftId: text("draft_id"),
  avatar: text("avatar"),
  settings: json<Record<string, unknown>>("settings").notNull(),
  scoringSettings: json<Record<string, number>>("scoring_settings").notNull(),
  rosterPositions: json<string[]>("roster_positions").notNull(),
  metadata: json<Record<string, unknown> | null>("metadata"),
  connectedUserId: text("connected_user_id"),
  retrievedAt: text("retrieved_at").notNull(),
});

export const leagueMembers = sqliteTable(
  "league_members",
  {
    leagueId: text("league_id").notNull(),
    userId: text("user_id").notNull(),
    displayName: text("display_name"),
    teamName: text("team_name"),
    avatar: text("avatar"),
    isCommissioner: integer("is_commissioner", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.userId] })],
);

export const rosters = sqliteTable(
  "rosters",
  {
    leagueId: text("league_id").notNull(),
    rosterId: text("roster_id").notNull(),
    ownerId: text("owner_id"),
    coOwners: json<string[]>("co_owners").notNull(),
    players: json<string[]>("players").notNull(),
    starters: json<string[]>("starters").notNull(),
    reserve: json<string[]>("reserve").notNull(),
    taxi: json<string[]>("taxi").notNull(),
    settings: json<Record<string, unknown>>("settings").notNull(),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.rosterId] })],
);

export const drafts = sqliteTable("drafts", {
  draftId: text("draft_id").primaryKey(),
  leagueId: text("league_id").notNull(),
  season: text("season").notNull(),
  status: text("status").notNull(),
  type: text("type"),
  rounds: integer("rounds"),
  startTime: integer("start_time"),
  slotToRosterId: json<Record<string, string> | null>("slot_to_roster_id"),
  draftOrder: json<Record<string, number> | null>("draft_order"),
  retrievedAt: text("retrieved_at").notNull(),
});

export const tradedPicks = sqliteTable(
  "traded_picks",
  {
    leagueId: text("league_id").notNull(),
    season: text("season").notNull(),
    round: integer("round").notNull(),
    originalRosterId: text("original_roster_id").notNull(),
    ownerRosterId: text("owner_roster_id").notNull(),
    previousOwnerRosterId: text("previous_owner_roster_id"),
    retrievedAt: text("retrieved_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.season, t.round, t.originalRosterId] })],
);

export const players = sqliteTable(
  "players",
  {
    playerId: text("player_id").primaryKey(),
    fullName: text("full_name"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    position: text("position"),
    fantasyPositions: json<string[]>("fantasy_positions").notNull(),
    team: text("team"),
    age: real("age"),
    birthDate: text("birth_date"),
    yearsExp: integer("years_exp"),
    rookieYear: text("rookie_year"),
    college: text("college"),
    status: text("status"),
    injuryStatus: text("injury_status"),
    injuryBodyPart: text("injury_body_part"),
    injuryStartDate: text("injury_start_date"),
    injuryNotes: text("injury_notes"),
    practiceParticipation: text("practice_participation"),
    depthChartPosition: text("depth_chart_position"),
    depthChartOrder: integer("depth_chart_order"),
    newsUpdated: integer("news_updated"),
    gsisId: text("gsis_id"),
    sportradarId: text("sportradar_id"),
    retrievedAt: text("retrieved_at").notNull(),
  },
  (t) => [index("players_sportradar_idx").on(t.sportradarId)],
);

export const playerIds = sqliteTable("player_ids", {
  sleeperId: text("sleeper_id").primaryKey(),
  gsisId: text("gsis_id"),
  pfrId: text("pfr_id"),
  sportradarId: text("sportradar_id"),
  resolvedVia: text("resolved_via").notNull(),
  retrievedAt: text("retrieved_at").notNull(),
});

export const mappingIssues = sqliteTable(
  "mapping_issues",
  {
    sleeperId: text("sleeper_id").notNull(),
    kind: text("kind").notNull(),
    detail: text("detail").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.sleeperId, t.kind] })],
);

export const statWeeks = sqliteTable(
  "stat_weeks",
  {
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    seasonType: text("season_type").notNull(),
    gsisId: text("gsis_id").notNull(),
    gameId: text("game_id"),
    team: text("team").notNull(),
    opponent: text("opponent"),
    position: text("position"),
    stats: json<Record<string, number | null>>("stats").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.season, t.week, t.seasonType, t.gsisId] }),
    index("stat_weeks_team_idx").on(t.season, t.team),
  ],
);

export const snapWeeks = sqliteTable(
  "snap_weeks",
  {
    gameId: text("game_id").notNull(),
    pfrId: text("pfr_id").notNull(),
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    gameType: text("game_type").notNull(),
    team: text("team").notNull(),
    position: text("position"),
    offenseSnaps: integer("offense_snaps"),
    offensePct: real("offense_pct"),
    defenseSnaps: integer("defense_snaps"),
    defensePct: real("defense_pct"),
    stSnaps: integer("st_snaps"),
  },
  (t) => [
    primaryKey({ columns: [t.gameId, t.pfrId] }),
    index("snap_weeks_pfr_idx").on(t.pfrId),
    index("snap_weeks_team_idx").on(t.season, t.team),
  ],
);

export const teamGameTotals = sqliteTable(
  "team_game_totals",
  {
    gameId: text("game_id").notNull(),
    team: text("team").notNull(),
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    targets: integer("targets").notNull(),
    carries: integer("carries").notNull(),
    airYards: real("air_yards").notNull(),
    passAttempts: integer("pass_attempts").notNull(),
    offenseSnaps: integer("offense_snaps"),
    defenseSnaps: integer("defense_snaps"),
    hasSnapCoverage: integer("has_snap_coverage", { mode: "boolean" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.team] }), index("team_totals_season_idx").on(t.season)],
);

export const scheduleGames = sqliteTable(
  "schedule_games",
  {
    gameId: text("game_id").primaryKey(),
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    gameType: text("game_type").notNull(),
    gameday: text("gameday"),
    gametime: text("gametime"),
    homeTeam: text("home_team").notNull(),
    awayTeam: text("away_team").notNull(),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    spreadLine: real("spread_line"),
    totalLine: real("total_line"),
  },
  (t) => [index("schedule_season_idx").on(t.season)],
);

export const prospectDraft = sqliteTable("prospect_draft", {
  pfrId: text("pfr_id").primaryKey(),
  gsisId: text("gsis_id"),
  season: integer("season").notNull(),
  round: integer("round").notNull(),
  pick: integer("pick").notNull(),
  team: text("team"),
  college: text("college"),
  position: text("position"),
});

export const prospectCombine = sqliteTable("prospect_combine", {
  pfrId: text("pfr_id").primaryKey(),
  season: integer("season").notNull(),
  position: text("position"),
  school: text("school"),
  height: text("height"),
  weight: real("weight"),
  forty: real("forty"),
  bench: real("bench"),
  vertical: real("vertical"),
  broadJump: real("broad_jump"),
  cone: real("cone"),
  shuttle: real("shuttle"),
});

export const metricObservations = sqliteTable(
  "metric_observations",
  {
    id: text("id").primaryKey(),
    playerId: text("player_id").notNull(),
    metricKey: text("metric_key").notNull(),
    label: text("label").notNull(),
    value: real("value"),
    units: text("units").notNull(),
    provider: text("provider").notNull(),
    sourceUrl: text("source_url"),
    season: integer("season"),
    weekStart: integer("week_start"),
    weekEnd: integer("week_end"),
    dateStart: text("date_start"),
    dateEnd: text("date_end"),
    sampleSize: real("sample_size"),
    definition: text("definition").notNull(),
    denominator: text("denominator"),
    dataCutoff: text("data_cutoff"),
    retrievedAt: text("retrieved_at").notNull(),
    kind: text("kind").notNull(),
    importBatch: text("import_batch"),
  },
  (t) => [index("metric_obs_player_idx").on(t.playerId)],
);

export const playerProjections = sqliteTable(
  "player_projections",
  {
    source: text("source").notNull(),
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    playerId: text("player_id").notNull(),
    stats: json<Record<string, number>>("stats"),
    lines: json<PropLine[]>("lines"),
    retrievedAt: text("retrieved_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.source, t.season, t.week, t.playerId] })],
);

export const marketRuns = sqliteTable(
  "market_runs",
  {
    provider: text("provider").notNull(),
    variantKey: text("variant_key").notNull(),
    valuedAt: text("valued_at"),
    retrievedAt: text("retrieved_at").notNull(),
    total: integer("total").notNull(),
    sourceUrl: text("source_url").notNull(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.variantKey] })],
);

export const marketValues = sqliteTable(
  "market_values",
  {
    provider: text("provider").notNull(),
    variantKey: text("variant_key").notNull(),
    playerId: text("player_id").notNull(),
    value: real("value"),
    rank: integer("rank"),
    positionRank: integer("position_rank"),
    change7d: real("change_7d"),
    change30d: real("change_30d"),
    valuedAt: text("valued_at"),
    metadataUpdatedAt: text("metadata_updated_at"),
    retrievedAt: text("retrieved_at").notNull(),
    url: text("url"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.variantKey, t.playerId] })],
);

export const marketPicks = sqliteTable(
  "market_picks",
  {
    provider: text("provider").notNull(),
    variantKey: text("variant_key").notNull(),
    pickId: text("pick_id").notNull(),
    year: integer("year").notNull(),
    round: integer("round").notNull(),
    slot: integer("slot"),
    variant: text("variant"),
    value: real("value"),
    valuedAt: text("valued_at"),
    retrievedAt: text("retrieved_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.variantKey, t.pickId] })],
);

export const marketValueHistory = sqliteTable(
  "market_value_history",
  {
    provider: text("provider").notNull(),
    variantKey: text("variant_key").notNull(),
    assetId: text("asset_id").notNull(),
    date: text("date").notNull(),
    value: real("value"),
    origin: text("origin").notNull(),
    retrievedAt: text("retrieved_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.variantKey, t.assetId, t.date] })],
);

export const leagueConfig = sqliteTable("league_config", {
  leagueId: text("league_id").primaryKey(),
  myRosterId: text("my_roster_id"),
  strategy: text("strategy").notNull().default("balanced"),
  targetPositions: json<string[]>("target_positions").notNull(),
  pickBudget: json<{ maxPicks: number; allowFirsts: boolean }>("pick_budget").notNull(),
  consolidationExponent: real("consolidation_exponent").notNull().default(1.35),
  draftOrderRules: text("draft_order_rules"),
  manualDraftSlots: json<Record<string, number>>("manual_draft_slots").notNull(),
  confirmedPickSeasons: json<string[]>("confirmed_pick_seasons").notNull(),
  opponentStrategies: json<Record<string, string>>("opponent_strategies").notNull(),
  marketProvider: text("market_provider").notNull().default("statsguy"),
  updatedAt: text("updated_at").notNull(),
});

export const assetFlags = sqliteTable(
  "asset_flags",
  {
    leagueId: text("league_id").notNull(),
    assetKey: text("asset_key").notNull(),
    flag: text("flag").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.assetKey] })],
);

export const snapshots = sqliteTable(
  "snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    leagueId: text("league_id").notNull(),
    rosterId: text("roster_id"),
    createdAt: text("created_at").notNull(),
    data: json<unknown>("data").notNull(),
  },
  (t) => [index("snapshots_league_idx").on(t.leagueId, t.createdAt)],
);

export const savedTrades = sqliteTable("saved_trades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leagueId: text("league_id").notNull(),
  name: text("name").notNull(),
  sideARosterId: text("side_a_roster_id").notNull(),
  sideBRosterId: text("side_b_roster_id").notNull(),
  sideA: json<string[]>("side_a").notNull(),
  sideB: json<string[]>("side_b").notNull(),
  summary: text("summary").notNull(),
  evaluation: json<unknown>("evaluation").notNull(),
  createdAt: text("created_at").notNull(),
});

export const aiReports = sqliteTable("ai_reports", {
  cacheKey: text("cache_key").primaryKey(),
  leagueId: text("league_id").notNull(),
  playerId: text("player_id").notNull(),
  model: text("model").notNull(),
  status: text("status").notNull(),
  response: json<unknown>("response").notNull(),
  createdAt: text("created_at").notNull(),
});

export const syncRuns = sqliteTable(
  "sync_runs",
  {
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    status: text("status").notNull(),
    message: text("message"),
    dataCutoff: text("data_cutoff"),
    rowCount: integer("row_count"),
    sourceUrl: text("source_url"),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
  },
  (t) => [primaryKey({ columns: [t.scope, t.key] })],
);

export const appState = sqliteTable("app_state", {
  key: text("key").primaryKey(),
  value: json<unknown>("value").notNull(),
});
