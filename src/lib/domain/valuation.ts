import { parsePickKey, valuePick, type PickAsset, type PickValuation } from "./picks";
import type { MarketSnapshot } from "./types";

/** Top of the provider scale; the adjustment leaves an asset at this value unchanged. */
export const VALUE_SCALE = 10_000;
export const DEFAULT_CONSOLIDATION_EXPONENT = 1.35;

/**
 * Consolidation adjustment: value^k / SCALE^(k-1). With k > 1, one elite asset
 * is worth more than several smaller assets whose raw values sum to the same
 * total. k = 1 disables the adjustment.
 */
export function adjustValue(value: number, exponent: number) {
  if (exponent === 1 || value <= 0) return value;
  return value ** exponent / VALUE_SCALE ** (exponent - 1);
}

export interface AssetValuation {
  assetKey: string;
  value: number | null;
  adjusted: number | null;
  pick: PickValuation | null;
  missingReason: string | null;
}

export function playerKey(playerId: string) {
  return `player:${playerId}`;
}

export function parseAssetKey(key: string): { kind: "player"; playerId: string } | { kind: "pick"; season: string; round: number; originalRosterId: string } | null {
  if (key.startsWith("player:")) return { kind: "player", playerId: key.slice("player:".length) };
  const pick = parsePickKey(key);
  return pick ? { kind: "pick", ...pick } : null;
}

export function valueAsset(
  assetKey: string,
  market: MarketSnapshot,
  picksByKey: Map<string, PickAsset>,
  exponent: number,
): AssetValuation {
  const parsed = parseAssetKey(assetKey);
  if (!parsed) return { assetKey, value: null, adjusted: null, pick: null, missingReason: "Unrecognized asset." };
  if (parsed.kind === "player") {
    const record = market.values.get(parsed.playerId);
    const value = record?.value ?? null;
    return {
      assetKey,
      value,
      adjusted: value === null ? null : adjustValue(value, exponent),
      pick: null,
      missingReason: value === null ? `No ${market.providerLabel} value for this player in this format.` : null,
    };
  }
  const pick = picksByKey.get(assetKey);
  if (!pick) return { assetKey, value: null, adjusted: null, pick: null, missingReason: "Pick is not in the confirmed inventory." };
  const valuation = valuePick(pick, market);
  return {
    assetKey,
    value: valuation.value,
    adjusted: valuation.value === null ? null : adjustValue(valuation.value, exponent),
    pick: valuation,
    missingReason: valuation.value === null ? valuation.basis : null,
  };
}

export interface SideValue {
  assets: AssetValuation[];
  raw: number | null;
  adjusted: number | null;
  missing: AssetValuation[];
  topAssetShare: number | null;
}

export function valueSide(
  assetKeys: string[],
  market: MarketSnapshot,
  picksByKey: Map<string, PickAsset>,
  exponent: number,
): SideValue {
  const assets = assetKeys.map((key) => valueAsset(key, market, picksByKey, exponent));
  const missing = assets.filter((a) => a.value === null);
  if (missing.length > 0 || assets.length === 0) {
    return { assets, raw: null, adjusted: null, missing, topAssetShare: null };
  }
  const raw = assets.reduce((total, a) => total + (a.value ?? 0), 0);
  const adjusted = assets.reduce((total, a) => total + (a.adjusted ?? 0), 0);
  const top = Math.max(...assets.map((a) => a.value ?? 0));
  return { assets, raw, adjusted, missing, topAssetShare: raw > 0 ? top / raw : null };
}
