import type { StatLine } from "./types";

interface ScoringRule {
  label: string;
  compute: (stats: StatLine, position: string | null) => number;
}

/**
 * Within a recorded game, an unrecorded counting stat is zero. Games without a
 * record are never scored, so missing games stay null upstream.
 */
function stat(stats: StatLine, column: string) {
  return stats[column] ?? 0;
}

function sum(...columns: string[]) {
  return (stats: StatLine) => columns.reduce((total, column) => total + stat(stats, column), 0);
}

function threshold(columns: string[], min: number) {
  return (stats: StatLine) => (sum(...columns)(stats) >= min ? 1 : 0);
}

function forPosition(position: string, column: string) {
  return (stats: StatLine, playerPosition: string | null) => (playerPosition === position ? stat(stats, column) : 0);
}

export const SCORING_RULES: Record<string, ScoringRule> = {
  pass_yd: { label: "Passing yards", compute: sum("passing_yards") },
  pass_td: { label: "Passing TD", compute: sum("passing_tds") },
  pass_int: { label: "Interception thrown", compute: sum("passing_interceptions") },
  pass_2pt: { label: "Passing 2PT", compute: sum("passing_2pt_conversions") },
  pass_att: { label: "Pass attempt", compute: sum("attempts") },
  pass_cmp: { label: "Completion", compute: sum("completions") },
  pass_inc: { label: "Incompletion", compute: (s) => stat(s, "attempts") - stat(s, "completions") },
  pass_fd: { label: "Passing first down", compute: sum("passing_first_downs") },
  pass_sack: { label: "Sacked", compute: sum("sacks_suffered") },
  rush_yd: { label: "Rushing yards", compute: sum("rushing_yards") },
  rush_td: { label: "Rushing TD", compute: sum("rushing_tds") },
  rush_att: { label: "Rush attempt", compute: sum("carries") },
  rush_2pt: { label: "Rushing 2PT", compute: sum("rushing_2pt_conversions") },
  rush_fd: { label: "Rushing first down", compute: sum("rushing_first_downs") },
  rec: { label: "Reception", compute: sum("receptions") },
  rec_yd: { label: "Receiving yards", compute: sum("receiving_yards") },
  rec_td: { label: "Receiving TD", compute: sum("receiving_tds") },
  rec_2pt: { label: "Receiving 2PT", compute: sum("receiving_2pt_conversions") },
  rec_fd: { label: "Receiving first down", compute: sum("receiving_first_downs") },
  rec_tgt: { label: "Target", compute: sum("targets") },
  bonus_rec_te: { label: "TE reception bonus", compute: forPosition("TE", "receptions") },
  bonus_rec_rb: { label: "RB reception bonus", compute: forPosition("RB", "receptions") },
  bonus_rec_wr: { label: "WR reception bonus", compute: forPosition("WR", "receptions") },
  bonus_pass_yd_300: { label: "300+ passing yards", compute: threshold(["passing_yards"], 300) },
  bonus_pass_yd_400: { label: "400+ passing yards", compute: threshold(["passing_yards"], 400) },
  bonus_pass_cmp_25: { label: "25+ completions", compute: threshold(["completions"], 25) },
  bonus_rush_yd_100: { label: "100+ rushing yards", compute: threshold(["rushing_yards"], 100) },
  bonus_rush_yd_200: { label: "200+ rushing yards", compute: threshold(["rushing_yards"], 200) },
  bonus_rush_att_20: { label: "20+ carries", compute: threshold(["carries"], 20) },
  bonus_rec_yd_100: { label: "100+ receiving yards", compute: threshold(["receiving_yards"], 100) },
  bonus_rec_yd_200: { label: "200+ receiving yards", compute: threshold(["receiving_yards"], 200) },
  bonus_rush_rec_yd_100: { label: "100+ scrimmage yards", compute: threshold(["rushing_yards", "receiving_yards"], 100) },
  bonus_rush_rec_yd_200: { label: "200+ scrimmage yards", compute: threshold(["rushing_yards", "receiving_yards"], 200) },
  fum: { label: "Fumble", compute: sum("fumbles_total") },
  fum_lost: { label: "Fumble lost", compute: sum("fumbles_lost_total") },
  fum_rec_td: { label: "Fumble recovery TD", compute: sum("fumble_recovery_tds") },
  st_td: { label: "Special teams TD", compute: sum("special_teams_tds") },
  kr_yd: { label: "Kick return yards", compute: sum("kickoff_return_yards") },
  pr_yd: { label: "Punt return yards", compute: sum("punt_return_yards") },
  xpm: { label: "PAT made", compute: sum("pat_made") },
  xpmiss: { label: "PAT missed", compute: sum("pat_missed") },
  fgm: { label: "FG made", compute: sum("fg_made") },
  fgmiss: { label: "FG missed", compute: sum("fg_missed") },
  fgm_0_19: { label: "FG made 0-19", compute: sum("fg_made_0_19") },
  fgm_20_29: { label: "FG made 20-29", compute: sum("fg_made_20_29") },
  fgm_30_39: { label: "FG made 30-39", compute: sum("fg_made_30_39") },
  fgm_40_49: { label: "FG made 40-49", compute: sum("fg_made_40_49") },
  fgm_50p: { label: "FG made 50+", compute: sum("fg_made_50_59", "fg_made_60_") },
  fgm_50_59: { label: "FG made 50-59", compute: sum("fg_made_50_59") },
  fgm_60p: { label: "FG made 60+", compute: sum("fg_made_60_") },
  fgmiss_50_59: { label: "FG missed 50-59", compute: sum("fg_missed_50_59") },
  fgmiss_60p: { label: "FG missed 60+", compute: sum("fg_missed_60_") },
  fgmiss_0_19: { label: "FG missed 0-19", compute: sum("fg_missed_0_19") },
  fgmiss_20_29: { label: "FG missed 20-29", compute: sum("fg_missed_20_29") },
  fgmiss_30_39: { label: "FG missed 30-39", compute: sum("fg_missed_30_39") },
  fgmiss_40_49: { label: "FG missed 40-49", compute: sum("fg_missed_40_49") },
  fgmiss_50p: { label: "FG missed 50+", compute: sum("fg_missed_50_59", "fg_missed_60_") },
  idp_tkl_solo: { label: "Solo tackle", compute: sum("def_tackles_solo") },
  idp_tkl_ast: { label: "Assisted tackle", compute: sum("def_tackle_assists") },
  idp_tkl: { label: "Tackle (solo + assisted)", compute: sum("def_tackles_solo", "def_tackle_assists") },
  idp_tkl_loss: { label: "Tackle for loss", compute: sum("def_tackles_for_loss") },
  idp_sack: { label: "Sack", compute: sum("def_sacks") },
  idp_sack_yd: { label: "Sack yards", compute: sum("def_sack_yards") },
  idp_qb_hit: { label: "QB hit", compute: sum("def_qb_hits") },
  idp_int: { label: "Interception", compute: sum("def_interceptions") },
  idp_int_ret_yd: { label: "Interception return yards", compute: sum("def_interception_yards") },
  idp_ff: { label: "Forced fumble", compute: sum("def_fumbles_forced") },
  idp_fum_rec: { label: "Fumble recovery", compute: sum("fumble_recovery_opp") },
  idp_pass_def: { label: "Pass defended", compute: sum("def_pass_defended") },
  idp_def_td: { label: "Defensive TD", compute: sum("def_tds") },
  idp_safe: { label: "Safety", compute: sum("def_safeties") },
  idp_blk_kick: { label: "Blocked kick", compute: sum("def_fg_blocks", "def_punt_blocks", "def_pat_blocks") },
};

/** Stat columns the ingestion layer must retain for scoring and metrics. */
export const REQUIRED_STAT_COLUMNS = [
  ...new Set([
    "completions", "attempts", "passing_yards", "passing_tds", "passing_interceptions", "sacks_suffered",
    "passing_air_yards", "passing_first_downs", "passing_epa", "passing_cpoe", "passing_2pt_conversions",
    "carries", "rushing_yards", "rushing_tds", "rushing_first_downs", "rushing_epa", "rushing_2pt_conversions",
    "receptions", "targets", "receiving_yards", "receiving_tds", "receiving_air_yards",
    "receiving_yards_after_catch", "receiving_first_downs", "receiving_epa", "receiving_2pt_conversions",
    "special_teams_tds", "def_tackles_solo", "def_tackle_assists", "def_tackles_for_loss", "def_fumbles_forced",
    "def_sacks", "def_sack_yards", "def_qb_hits", "def_interceptions", "def_interception_yards",
    "def_pass_defended", "def_tds", "def_safeties", "def_punt_blocks", "def_pat_blocks", "def_fg_blocks",
    "fumble_recovery_opp", "fumble_recovery_tds", "fumbles_total", "fumbles_lost_total",
    "kickoff_return_yards", "punt_return_yards", "fg_made", "fg_att", "fg_missed", "fg_made_0_19",
    "fg_made_20_29", "fg_made_30_39", "fg_made_40_49", "fg_made_50_59", "fg_made_60_", "fg_missed_0_19",
    "fg_missed_20_29", "fg_missed_30_39", "fg_missed_40_49", "fg_missed_50_59", "fg_missed_60_",
    "pat_made", "pat_att", "pat_missed", "fantasy_points", "fantasy_points_ppr",
  ]),
];

const TEAM_DEFENSE_PREFIXES = ["pts_allow", "yds_allow", "def_", "blk_kick", "sack", "int", "ff", "fum_rec", "safe"];

export interface UnsupportedRule {
  key: string;
  points: number;
  reason: string;
  /** Positions the rule can affect; null means any position. */
  positions: string[] | null;
}

export interface ScoringSupport {
  supported: { key: string; label: string; points: number }[];
  unsupported: UnsupportedRule[];
}

export function analyzeScoringSupport(scoringSettings: Record<string, number>): ScoringSupport {
  const supported: ScoringSupport["supported"] = [];
  const unsupported: UnsupportedRule[] = [];
  for (const [key, points] of Object.entries(scoringSettings)) {
    if (!points) continue;
    const rule = SCORING_RULES[key];
    if (rule) supported.push({ key, label: rule.label, points });
    else unsupported.push(describeUnsupported(key, points));
  }
  return { supported, unsupported };
}

function describeUnsupported(key: string, points: number): UnsupportedRule {
  if (TEAM_DEFENSE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    return { key, points, reason: "Team defense scoring is not modeled.", positions: ["DEF"] };
  }
  if (key.startsWith("fg") || key.startsWith("xp")) {
    return { key, points, reason: "Kicking rule has no matching per-game statistic.", positions: ["K"] };
  }
  if (key.startsWith("idp_")) {
    return { key, points, reason: "IDP rule has no matching per-game statistic.", positions: ["DL", "LB", "DB"] };
  }
  if (/_\d+_\d+$|_\d+p$/.test(key)) {
    return { key, points, reason: "Yardage-bucket scoring needs play-by-play data.", positions: null };
  }
  return { key, points, reason: "No matching per-game statistic in nflverse player stats.", positions: null };
}

export function unsupportedRulesFor(support: ScoringSupport, position: string | null) {
  return support.unsupported.filter((rule) => !rule.positions || (position !== null && rule.positions.includes(position)));
}

export interface ScoredGame {
  points: number;
  isPartial: boolean;
}

export function scoreStatLine(
  stats: StatLine,
  position: string | null,
  scoringSettings: Record<string, number>,
  support: ScoringSupport = analyzeScoringSupport(scoringSettings),
): ScoredGame {
  let points = 0;
  for (const { key, points: weight } of support.supported) {
    points += SCORING_RULES[key].compute(stats, position) * weight;
  }
  return { points: Math.round(points * 100) / 100, isPartial: unsupportedRulesFor(support, position).length > 0 };
}

/** Common IDP scoring used to turn defensive production into one comparable fantasy outcome. */
export const IDP_SCORING: Record<string, number> = { idp_tkl_solo: 1, idp_tkl_ast: 0.5, idp_tkl_loss: 1, idp_sack: 4, idp_qb_hit: 1, idp_int: 5, idp_pass_def: 1.5, idp_ff: 3, idp_fum_rec: 2, idp_def_td: 6, idp_safe: 2 };
