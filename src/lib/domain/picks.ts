import type { DraftRecord, MarketSnapshot, TradedPickRecord } from "./types";

export type PickTier = "early" | "mid" | "late";

export interface PickAsset {
  key: string;
  season: string;
  round: number;
  originalRosterId: string;
  ownerRosterId: string;
  slot: number | null;
  slotSource: "draft" | "manual" | null;
}

export interface PickSeasonStatus {
  season: string;
  rounds: number | null;
  status: "confirmed" | "unconfirmed" | "consumed" | "in_progress";
  reason: string;
}

export interface ExcludedPick {
  season: string;
  round: number | null;
  originalRosterId: string | null;
  reason: string;
}

export interface PickInventory {
  picks: PickAsset[];
  seasons: PickSeasonStatus[];
  excluded: ExcludedPick[];
}

export interface PickInventoryInput {
  leagueSeason: string;
  rosterIds: string[];
  drafts: DraftRecord[];
  tradedPicks: TradedPickRecord[];
  defaultRounds: number | null;
  confirmedSeasons: string[];
  manualDraftSlots: Record<string, number>;
  futureSeasonWindow?: number;
}

export function pickKey(season: string, round: number, originalRosterId: string) {
  return `pick:${season}:${round}:${originalRosterId}`;
}

export function parsePickKey(key: string) {
  const [prefix, season, round, originalRosterId] = key.split(":");
  if (prefix !== "pick" || !season || !round || !originalRosterId) return null;
  return { season, round: Number(round), originalRosterId };
}

/**
 * The base inventory comes from confirmed draft settings only. Traded-pick
 * records then move ownership; they never create picks on their own.
 */
export function buildPickInventory(input: PickInventoryInput): PickInventory {
  const window = input.futureSeasonWindow ?? 3;
  const rosterSet = new Set(input.rosterIds);
  const draftBySeason = new Map(input.drafts.map((d) => [d.season, d]));
  const tradedSeasons = new Set(input.tradedPicks.map((p) => p.season));
  const leagueSeason = Number(input.leagueSeason);

  const currentDraft = draftBySeason.get(input.leagueSeason);
  const firstOpenSeason = currentDraft && currentDraft.status === "pre_draft" ? leagueSeason : leagueSeason + 1;

  const seasons: PickSeasonStatus[] = [];
  const excluded: ExcludedPick[] = [];
  const picks: PickAsset[] = [];

  if (currentDraft && currentDraft.status === "complete") {
    seasons.push({ season: input.leagueSeason, rounds: currentDraft.rounds, status: "consumed", reason: "Draft complete." });
  } else if (currentDraft && currentDraft.status !== "pre_draft") {
    seasons.push({ season: input.leagueSeason, rounds: currentDraft.rounds, status: "in_progress", reason: "Draft in progress; picks are ambiguous." });
  }

  for (let offset = 0; offset < window; offset++) {
    const season = String(firstOpenSeason + offset);
    const draft = draftBySeason.get(season);
    const rounds = draft?.rounds ?? input.defaultRounds;
    const confirmation = draft
      ? "Draft created in Sleeper."
      : tradedSeasons.has(season)
        ? "Season appears in league pick trades."
        : input.confirmedSeasons.includes(season)
          ? "Confirmed manually."
          : null;

    if (!rounds) {
      seasons.push({ season, rounds: null, status: "unconfirmed", reason: "Round count unknown." });
      continue;
    }
    if (!confirmation) {
      seasons.push({ season, rounds, status: "unconfirmed", reason: "Not yet confirmed by a draft or traded pick." });
      continue;
    }
    seasons.push({ season, rounds, status: "confirmed", reason: confirmation });

    const slotByRoster = slotsForSeason(draft, season === String(firstOpenSeason) ? input.manualDraftSlots : {});
    for (let round = 1; round <= rounds; round++) {
      for (const rosterId of input.rosterIds) {
        const slot = slotByRoster.get(rosterId) ?? null;
        picks.push({
          key: pickKey(season, round, rosterId),
          season,
          round,
          originalRosterId: rosterId,
          ownerRosterId: rosterId,
          slot: slot?.slot ?? null,
          slotSource: slot?.source ?? null,
        });
      }
    }
  }

  const pickByKey = new Map(picks.map((p) => [p.key, p]));
  const confirmedSeasons = new Set(seasons.filter((s) => s.status === "confirmed").map((s) => s.season));

  for (const trade of input.tradedPicks) {
    const key = pickKey(trade.season, trade.round, trade.originalRosterId);
    const pick = pickByKey.get(key);
    if (Number(trade.season) < firstOpenSeason) continue;
    if (!confirmedSeasons.has(trade.season)) continue;
    if (!pick || !rosterSet.has(trade.ownerRosterId)) {
      excluded.push({
        season: trade.season,
        round: trade.round,
        originalRosterId: trade.originalRosterId,
        reason: "Traded pick does not match the confirmed inventory.",
      });
      pickByKey.delete(key);
      continue;
    }
    pick.ownerRosterId = trade.ownerRosterId;
  }

  return { picks: [...pickByKey.values()], seasons, excluded };
}

function slotsForSeason(draft: DraftRecord | undefined, manual: Record<string, number>) {
  const result = new Map<string, { slot: number; source: "draft" | "manual" }>();
  if (draft?.status === "pre_draft" && draft.slotToRosterId) {
    for (const [slot, rosterId] of Object.entries(draft.slotToRosterId)) {
      if (rosterId) result.set(String(rosterId), { slot: Number(slot), source: "draft" });
    }
  }
  for (const [rosterId, slot] of Object.entries(manual)) {
    if (!result.has(rosterId) && Number.isFinite(slot)) result.set(rosterId, { slot, source: "manual" });
  }
  return result;
}

export interface PickValuation {
  value: number | null;
  range: { early: number | null; mid: number | null; late: number | null } | null;
  basis: string;
  marketId: string | null;
}

export function valuePick(pick: PickAsset, market: MarketSnapshot): PickValuation {
  const format = market.format;
  if (pick.slot !== null) {
    const id = `pick:${pick.season}:${pick.round}.${String(pick.slot).padStart(2, "0")}`;
    const exact = market.picks.get(id);
    if (exact?.value != null) {
      return { value: exact.value, range: null, basis: `Slot ${pick.round}.${String(pick.slot).padStart(2, "0")} (${pick.slotSource})`, marketId: id };
    }
  }
  const tier = (t: PickTier) => market.picks.get(`pick:${pick.season}:${pick.round}:${t}`)?.value ?? null;
  const range = { early: tier("early"), mid: tier("mid"), late: tier("late") };
  if (range.mid === null) return { value: null, range: null, basis: `No ${format} value for this round`, marketId: null };
  return {
    value: range.mid,
    range,
    basis: "Slot unknown; mid-round scenario used, early and late shown as range",
    marketId: `pick:${pick.season}:${pick.round}:mid`,
  };
}

export function pickLabel(pick: Pick<PickAsset, "season" | "round" | "slot">, originalTeam?: string) {
  const ordinal = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th"][pick.round] ?? `R${pick.round}`;
  const slot = pick.slot !== null ? ` (${pick.round}.${String(pick.slot).padStart(2, "0")})` : "";
  return `${pick.season} ${ordinal}${slot}${originalTeam ? ` via ${originalTeam}` : ""}`;
}
