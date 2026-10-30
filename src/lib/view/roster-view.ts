import type { LeagueModel, PlayerAnalysis } from "@/lib/analysis/league-model";
import type { WeekEntry } from "@/lib/domain/metrics";
import { valuePick } from "@/lib/domain/picks";
import type { AssetFlag, Recommendation } from "@/lib/domain/types";

export interface RosterRow {
  playerId: string;
  name: string;
  position: string;
  team: string | null;
  age: number | null;
  slot: string;
  injury: string | null;
  ppg: number | null;
  gamesPlayed: number | null;
  teamGames: number | null;
  scoringPartial: boolean;
  recentShare: number | null;
  shareLabel: string;
  usage: (number | null)[];
  value: number | null;
  change30d: number | null;
  valueHistory: number[];
  recommendation: Recommendation;
  reason: string;
  coverage: number;
  coverageTotal: number;
  coverageGaps: string[];
  flag: AssetFlag | null;
  unsupported: boolean;
}

export function rosterRows(model: LeagueModel, rosterId: string): RosterRow[] {
  const team = model.teamsById.get(rosterId);
  if (!team) return [];
  return team.roster.players.map((id) => toRow(model.players.get(id)!, model));
}

const USAGE_METRIC: Record<string, { key: string; label: string; weekly: (w: WeekEntry) => [number | null, number | null] }> = {
  QB: { key: "offense_snap_share", label: "Snap share", weekly: (w) => [w.offenseSnaps, w.teamTotals?.offenseSnaps ?? null] },
  RB: { key: "carry_share", label: "Carry share", weekly: (w) => [w.stats?.carries ?? 0, w.teamTotals?.carries ?? null] },
  WR: { key: "target_share", label: "Target share", weekly: (w) => [w.stats?.targets ?? 0, w.teamTotals?.targets ?? null] },
  TE: { key: "target_share", label: "Target share", weekly: (w) => [w.stats?.targets ?? 0, w.teamTotals?.targets ?? null] },
  DL: { key: "defense_snap_share", label: "Snap share", weekly: (w) => [w.defenseSnaps, w.teamTotals?.defenseSnaps ?? null] },
  LB: { key: "defense_snap_share", label: "Snap share", weekly: (w) => [w.defenseSnaps, w.teamTotals?.defenseSnaps ?? null] },
  DB: { key: "defense_snap_share", label: "Snap share", weekly: (w) => [w.defenseSnaps, w.teamTotals?.defenseSnaps ?? null] },
};

export function usageShare(player: PlayerAnalysis) {
  const metric = USAGE_METRIC[player.position ?? ""];
  if (!metric) return { label: "Usage", recent: null };
  const recent = player.metrics.recent.find((e) => e.metricKey === metric.key)?.value;
  return { label: metric.label, recent: typeof recent === "number" ? recent : null };
}

/** Weekly share for played games; byes, inactive weeks, and missing records stay null. */
export function weeklyShare(player: PlayerAnalysis): (number | null)[] {
  const metric = USAGE_METRIC[player.position ?? ""];
  return player.weeks
    .filter((w) => w.status !== "upcoming")
    .map((w) => {
      if (!metric || w.status !== "played") return null;
      const [numerator, denominator] = metric.weekly(w);
      return numerator !== null && denominator ? Math.round((numerator / denominator) * 1000) / 10 : null;
    });
}

function toRow(player: PlayerAnalysis, model: LeagueModel): RosterRow {
  const share = usageShare(player);
  const history = model.dataset.marketHistory.get(player.playerId) ?? [];
  return {
    playerId: player.playerId,
    name: player.name,
    position: player.position ?? "?",
    team: player.team,
    age: player.age,
    slot: player.rosterSlot ?? "bench",
    injury: player.player?.injuryStatus ?? null,
    ppg: player.season?.pointsPerGame ?? null,
    gamesPlayed: player.season?.gamesPlayed ?? null,
    teamGames: player.season?.teamGames ?? null,
    scoringPartial: player.unsupportedScoring.length > 0,
    recentShare: share.recent,
    shareLabel: share.label,
    usage: weeklyShare(player),
    value: player.market?.value ?? null,
    change30d: player.market?.change30d ?? null,
    valueHistory: history.filter((h) => h.value !== null).slice(-90).map((h) => h.value!),
    recommendation: player.recommendation.recommendation,
    reason: player.recommendation.headline,
    coverage: player.coverage.available,
    coverageTotal: player.coverage.total,
    coverageGaps: player.coverage.gaps,
    flag: player.flag,
    unsupported: player.market?.value == null,
  };
}

export interface PickRow {
  key: string;
  label: string;
  originalTeam: string;
  isOwn: boolean;
  value: number | null;
  range: { early: number | null; late: number | null } | null;
  basis: string;
  flag: AssetFlag | null;
}

export function pickRows(model: LeagueModel, rosterId: string): PickRow[] {
  const team = model.teamsById.get(rosterId);
  if (!team) return [];
  return team.picks
    .map((pick) => {
      const valuation = model.dataset.market ? valuePick(pick, model.dataset.market) : null;
      const original = model.teamsById.get(pick.originalRosterId)?.name ?? `Roster ${pick.originalRosterId}`;
      const ordinal = ["", "1st", "2nd", "3rd", "4th", "5th"][pick.round] ?? `Round ${pick.round}`;
      return {
        key: pick.key,
        label: `${pick.season} ${ordinal}${pick.slot !== null ? ` (${pick.round}.${String(pick.slot).padStart(2, "0")})` : ""}`,
        originalTeam: original,
        isOwn: pick.originalRosterId === rosterId,
        value: valuation?.value ?? null,
        range: valuation?.range ? { early: valuation.range.early, late: valuation.range.late } : null,
        basis: valuation?.basis ?? "No market values loaded",
        flag: model.dataset.config.flags.get(pick.key) ?? null,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}
