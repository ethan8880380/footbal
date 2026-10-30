import { SCORING_RULES } from "./scoring";
import { toNflverseTeam } from "./teams";

/**
 * Prop markets keyed by SportsGameOdds statID, mapped to Sleeper stat keys.
 * `count` markets sit on low half-point lines, so their mean comes from a Poisson fit to the over price.
 */
export const PROP_MARKETS = {
  passing_yards: { stat: "pass_yd", label: "Pass yds", count: false },
  passing_touchdowns: { stat: "pass_td", label: "Pass TD", count: true },
  passing_interceptions: { stat: "pass_int", label: "INT thrown", count: true },
  passing_completions: { stat: "pass_cmp", label: "Completions", count: false },
  passing_attempts: { stat: "pass_att", label: "Pass att", count: false },
  rushing_yards: { stat: "rush_yd", label: "Rush yds", count: false },
  rushing_attempts: { stat: "rush_att", label: "Carries", count: false },
  receiving_yards: { stat: "rec_yd", label: "Rec yds", count: false },
  receiving_receptions: { stat: "rec", label: "Receptions", count: false },
  touchdowns: { stat: null, label: "Anytime TD", count: true },
  defense_soloTackles: { stat: "idp_tkl_solo", label: "Solo tackles", count: false },
  defense_assistedTackles: { stat: "idp_tkl_ast", label: "Assists", count: false },
  defense_combinedTackles: { stat: "idp_tkl", label: "Tackles", count: false },
  defense_sacks: { stat: "idp_sack", label: "Sacks", count: true },
  defense_interceptions: { stat: "idp_int", label: "INT", count: true },
} as const;
export type PropMarket = keyof typeof PROP_MARKETS;

export interface PropLine {
  market: PropMarket;
  /** Over/under line; null for yes/no markets such as anytime touchdown. */
  line: number | null;
  /** Vig-free probability of the over (or yes). */
  overProbability: number | null;
}

const DEFAULT_SOLO_SHARE = 0.65;
const RECEPTION_BONUSES: [string, string][] = [["TE", "bonus_rec_te"], ["RB", "bonus_rec_rb"], ["WR", "bonus_rec_wr"]];
const FIRST_DOWNS: [string, string][] = [["rec_fd", "rec_yd"], ["rush_fd", "rush_yd"], ["pass_fd", "pass_yd"]];

/** Mean of the stat implied by one prop. */
export function expectedValue(prop: PropLine): number | null {
  const p = prop.overProbability === null ? null : Math.min(0.999, Math.max(0.001, prop.overProbability));
  if (prop.line === null) return p === null ? null : -Math.log(1 - p);
  if (!PROP_MARKETS[prop.market].count || p === null) return prop.line;
  return poissonMeanForOver(prop.line, p);
}

/** Overrides a base projection with prop-implied means, keeping dependent stats consistent. */
export function statsFromProps(base: Record<string, number>, props: PropLine[], positions: string[]): Record<string, number> {
  const stats = { ...base };
  const value = (market: PropMarket) => {
    const prop = props.find((p) => p.market === market);
    return prop ? expectedValue(prop) : null;
  };
  for (const prop of props) {
    const { stat } = PROP_MARKETS[prop.market];
    const mean = expectedValue(prop);
    if (stat && mean !== null) stats[stat] = round(mean);
  }

  const touchdowns = value("touchdowns");
  if (touchdowns !== null) {
    const rush = base.rush_td ?? 0;
    const rec = base.rec_td ?? 0;
    const rushShare = rush + rec > 0 ? rush / (rush + rec) : positions.includes("QB") ? 1 : positions.includes("RB") ? 0.7 : 0;
    stats.rush_td = round(touchdowns * rushShare);
    stats.rec_td = round(touchdowns * (1 - rushShare));
  }

  const combined = value("defense_combinedTackles");
  const solo = value("defense_soloTackles");
  const assists = value("defense_assistedTackles");
  if (combined !== null || solo !== null || assists !== null) {
    const baseSolo = base.idp_tkl_solo ?? 0;
    const baseAssists = base.idp_tkl_ast ?? 0;
    const soloShare = baseSolo + baseAssists > 0 ? baseSolo / (baseSolo + baseAssists) : DEFAULT_SOLO_SHARE;
    const soloMean = solo ?? (combined === null ? baseSolo : assists !== null ? combined - assists : combined * soloShare);
    const assistMean = combined !== null ? combined - soloMean : assists ?? baseAssists;
    stats.idp_tkl_solo = round(Math.max(0, soloMean));
    stats.idp_tkl_ast = round(Math.max(0, assistMean));
    stats.idp_tkl = round(stats.idp_tkl_solo + stats.idp_tkl_ast);
  }

  if (stats.rec !== undefined) {
    for (const [position, key] of RECEPTION_BONUSES) if (positions.includes(position) || key in base) stats[key] = stats.rec;
  }
  for (const [derived, parent] of FIRST_DOWNS) {
    if (base[derived] && base[parent] && stats[parent] !== base[parent]) stats[derived] = round((base[derived] * stats[parent]) / base[parent]);
  }
  if ("pass_inc" in base && stats.pass_att !== undefined && stats.pass_cmp !== undefined) stats.pass_inc = round(Math.max(0, stats.pass_att - stats.pass_cmp));
  return stats;
}

/** League points for a projected stat line; Sleeper stat keys match league scoring keys. */
export function scoreProjection(stats: Record<string, number>, scoring: Record<string, number>): number {
  return Math.round(Object.entries(stats).reduce((total, [key, value]) => total + (scoring[key] ?? 0) * value, 0) * 10) / 10;
}

export interface Contribution {
  label: string;
  value: number;
  points: number;
}

export function topContributions(stats: Record<string, number>, scoring: Record<string, number>, limit = 4): Contribution[] {
  return Object.entries(stats)
    .map(([key, value]) => ({ label: SCORING_RULES[key]?.label ?? key, value, points: (scoring[key] ?? 0) * value }))
    .filter((c) => Math.abs(c.points) >= 0.1)
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .slice(0, limit);
}

export interface DirectoryPlayer {
  playerId: string;
  fullName: string | null;
  team: string | null;
}

/** Resolves a sportsbook player name to a Sleeper ID by name and team, falling back to a unique name. */
export function propPlayerMatcher(directory: DirectoryPlayer[]) {
  const byNameTeam = new Map<string, string>();
  const byName = new Map<string, string[]>();
  for (const player of directory) {
    const team = toNflverseTeam(player.team);
    if (!player.fullName || !team) continue;
    const name = normalizeName(player.fullName);
    byNameTeam.set(`${name}|${team}`, player.playerId);
    byName.set(name, [...(byName.get(name) ?? []), player.playerId]);
  }
  return (name: string, team: string): string | null => {
    const normalized = normalizeName(name);
    const candidates = byName.get(normalized) ?? [];
    return byNameTeam.get(`${normalized}|${toNflverseTeam(team)}`) ?? (candidates.length === 1 ? candidates[0] : null);
  };
}

function normalizeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.'’-]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function americanToProbability(odds: number): number {
  return odds < 0 ? -odds / (100 - odds) : 100 / (odds + 100);
}

function poissonMeanForOver(line: number, overProbability: number) {
  const threshold = Math.floor(line);
  let low = 0;
  let high = 40;
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    if (1 - poissonCdf(threshold, mid) < overProbability) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

function poissonCdf(k: number, lambda: number) {
  let term = Math.exp(-lambda);
  let total = term;
  for (let i = 1; i <= k; i++) {
    term *= lambda / i;
    total += term;
  }
  return total;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
