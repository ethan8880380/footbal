import { parseAssetKey } from "../valuation";
import type { TradeContext, TradeIssue, TradeProposal } from "./types";

export function validateTrade(proposal: TradeProposal, ctx: Pick<TradeContext, "teams" | "picksByKey">): TradeIssue[] {
  const issues: TradeIssue[] = [];
  const { sideA, sideB } = proposal;

  if (sideA.rosterId === sideB.rosterId) {
    issues.push({ code: "same_team", message: "A trade needs two different teams.", assetKey: null });
  }
  for (const side of [sideA, sideB]) {
    if (!ctx.teams.has(side.rosterId)) {
      issues.push({ code: "unknown_team", message: `Roster ${side.rosterId} is not in this league.`, assetKey: null });
    }
    if (side.gives.length === 0) {
      issues.push({ code: "empty_side", message: "Each side must send at least one asset.", assetKey: null });
    }
  }

  const seen = new Map<string, string>();
  for (const side of [sideA, sideB]) {
    for (const assetKey of side.gives) {
      const owner = seen.get(assetKey);
      if (owner === side.rosterId) {
        issues.push({ code: "duplicate_asset", message: "The same asset appears twice on one side.", assetKey });
        continue;
      }
      if (owner !== undefined) {
        issues.push({ code: "asset_on_both_sides", message: "An asset cannot appear on both sides.", assetKey });
        continue;
      }
      seen.set(assetKey, side.rosterId);
      const ownership = checkOwnership(assetKey, side.rosterId, ctx);
      if (ownership) issues.push(ownership);
    }
  }
  return issues;
}

function checkOwnership(assetKey: string, rosterId: string, ctx: Pick<TradeContext, "teams" | "picksByKey">): TradeIssue | null {
  const parsed = parseAssetKey(assetKey);
  if (!parsed) return { code: "unknown_asset", message: "Unrecognized asset.", assetKey };
  if (parsed.kind === "player") {
    const team = ctx.teams.get(rosterId);
    return team?.playerIds.includes(parsed.playerId)
      ? null
      : { code: "not_owned", message: "This player is not on that roster.", assetKey };
  }
  const pick = ctx.picksByKey.get(assetKey);
  if (!pick) return { code: "unknown_asset", message: "Pick is not in the confirmed inventory.", assetKey };
  return pick.ownerRosterId === rosterId
    ? null
    : { code: "not_owned", message: "This pick is owned by another roster.", assetKey };
}
