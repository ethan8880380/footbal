import { z } from "zod";

const id = z.union([z.string(), z.number()]).transform(String);
const nullableId = z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? null : String(v)));
const idList = z
  .array(z.union([z.string(), z.number()]).nullable())
  .nullish()
  .transform((list) => (list ?? []).filter((v): v is string | number => v !== null && String(v) !== "0").map(String));

export const nflStateSchema = z.object({
  week: z.coerce.number(),
  season: z.string(),
  season_type: z.string(),
  league_season: z.string(),
  previous_season: z.string().nullish(),
  display_week: z.coerce.number().nullish(),
  season_start_date: z.string().nullish(),
  season_has_scores: z.boolean().nullish(),
});
export type NflState = z.infer<typeof nflStateSchema>;

export const sleeperUserSchema = z.object({
  user_id: id,
  username: z.string().nullish(),
  display_name: z.string().nullish(),
  avatar: z.string().nullish(),
});

export const leagueSchema = z.object({
  league_id: id,
  name: z.string().nullish().transform((v) => v ?? "Unnamed league"),
  season: z.string(),
  status: z.string().nullish(),
  sport: z.string().nullish(),
  total_rosters: z.coerce.number().nullish(),
  previous_league_id: nullableId,
  draft_id: nullableId,
  avatar: z.string().nullish(),
  settings: z.record(z.string(), z.unknown()).nullish().transform((v) => v ?? {}),
  scoring_settings: z
    .record(z.string(), z.union([z.number(), z.null()]))
    .nullish()
    .transform((v) => Object.fromEntries(Object.entries(v ?? {}).filter((e): e is [string, number] => typeof e[1] === "number"))),
  roster_positions: z.array(z.string()).nullish().transform((v) => v ?? []),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});
export type SleeperLeague = z.infer<typeof leagueSchema>;

export const rosterSchema = z.object({
  roster_id: id,
  owner_id: nullableId,
  co_owners: idList,
  players: idList,
  starters: idList,
  reserve: idList,
  taxi: idList,
  settings: z.record(z.string(), z.unknown()).nullish().transform((v) => v ?? {}),
});

export const leagueUserSchema = z.object({
  user_id: id,
  display_name: z.string().nullish(),
  avatar: z.string().nullish(),
  is_owner: z.boolean().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});

export const draftSchema = z.object({
  draft_id: id,
  season: z.string(),
  status: z.string(),
  type: z.string().nullish(),
  start_time: z.number().nullish(),
  settings: z.record(z.string(), z.unknown()).nullish().transform((v) => v ?? {}),
  slot_to_roster_id: z
    .record(z.string(), z.union([z.string(), z.number(), z.null()]))
    .nullish()
    .transform((v) => (v ? Object.fromEntries(Object.entries(v).filter((e) => e[1] !== null).map(([k, r]) => [k, String(r)])) : null)),
  draft_order: z.record(z.string(), z.number()).nullish(),
});

export const tradedPickSchema = z.object({
  season: z.union([z.string(), z.number()]).transform(String),
  round: z.coerce.number(),
  roster_id: id,
  owner_id: id,
  previous_owner_id: nullableId,
});

export const sleeperPlayerSchema = z.object({
  player_id: id.optional(),
  full_name: z.string().nullish(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  position: z.string().nullish(),
  fantasy_positions: z.array(z.string()).nullish(),
  team: z.string().nullish(),
  age: z.number().nullish(),
  birth_date: z.string().nullish(),
  years_exp: z.number().nullish(),
  college: z.string().nullish(),
  status: z.string().nullish(),
  injury_status: z.string().nullish(),
  injury_body_part: z.string().nullish(),
  injury_start_date: z.string().nullish(),
  injury_notes: z.string().nullish(),
  practice_participation: z.string().nullish(),
  depth_chart_position: z.string().nullish(),
  depth_chart_order: z.number().nullish(),
  news_updated: z.number().nullish(),
  gsis_id: z.string().nullish(),
  sportradar_id: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});
export type SleeperPlayer = z.infer<typeof sleeperPlayerSchema>;

export const matchupSchema = z.object({
  roster_id: id,
  matchup_id: z.number().nullish(),
  points: z.number().nullish().transform((v) => v ?? 0),
  /** Slot order matches the league's non-bench `roster_positions`; "0" marks an empty slot. */
  starters: z.array(z.union([z.string(), z.number()]).nullable()).nullish().transform((list) => (list ?? []).map((v) => (v == null ? "0" : String(v)))),
  starters_points: z.array(z.number().nullable()).nullish().transform((list) => (list ?? []).map((v) => v ?? 0)),
  players: idList,
  players_points: z.record(z.string(), z.number().nullable()).nullish().transform((v) => v ?? {}),
});
export type SleeperMatchup = z.infer<typeof matchupSchema>;

export const projectionSchema = z.object({
  player_id: id,
  /** Keys match league `scoring_settings`; values are per-game means. */
  stats: z
    .record(z.string(), z.number().nullable())
    .nullish()
    .transform((stats) => Object.fromEntries(Object.entries(stats ?? {}).filter((e): e is [string, number] => typeof e[1] === "number" && e[1] !== 0))),
  company: z.string().nullish(),
});
export type SleeperProjection = z.infer<typeof projectionSchema>;
