import { parseAssetKey, playerKey, valueAsset } from "../valuation";
import { meetsTradeGoal, permittedProposal, proposalKey, tradeScore, type AdvisorConstraints, type TradeGoal } from "./advisor";
import { evaluateTrade, type TradeEvaluation } from "./evaluate";
import type { TradeContext, TradeProposal } from "./types";

export interface FinderInput {
  assetKey: string;
  goal: TradeGoal;
  returns: "any" | "players" | "picks";
}
export interface FoundTrade { proposal: TradeProposal; evaluation: TradeEvaluation; score: number }
interface Asset { key: string; value: number; pick: boolean }

export function assetOwner(key: string, ctx: TradeContext) {
  const parsed = parseAssetKey(key);
  if (!parsed) return null;
  if (parsed.kind === "pick") return ctx.picksByKey.get(key)?.ownerRosterId ?? null;
  return [...ctx.teams.values()].find((t) => t.playerIds.includes(parsed.playerId))?.rosterId ?? null;
}

/** Searches one-for-one and one-for-two packages, keeping the chosen centerpiece fixed. */
export function findAssetTrades(input: FinderInput, ctx: TradeContext, constraints: AdvisorConstraints): FoundTrade[] {
  if (!ctx.market || !ctx.teams.has(constraints.rosterId)) return [];
  const owner = assetOwner(input.assetKey, ctx);
  if (!owner || ctx.teams.get(owner)?.isUnowned || constraints.flags.get(input.assetKey) === "protected") return [];
  const anchorValue = valueAsset(input.assetKey, ctx.market, ctx.picksByKey, ctx.exponent).adjusted;
  if (anchorValue === null || anchorValue <= 0) return [];
  const selling = owner === constraints.rosterId;
  const pool = (rosterId: string): Asset[] => {
    const team = ctx.teams.get(rosterId)!;
    return [...team.playerIds.map(playerKey), ...[...ctx.picksByKey.values()].filter((p) => p.ownerRosterId === rosterId).map((p) => p.key)]
      .filter((key) => constraints.flags.get(key) !== "protected")
      .map((key) => ({ key, value: valueAsset(key, ctx.market!, ctx.picksByKey, ctx.exponent).adjusted, pick: key.startsWith("pick:") }))
      .filter((a): a is Asset => a.value !== null && a.value > 0)
      .sort((a, b) => Math.abs(a.value - anchorValue) - Math.abs(b.value - anchorValue)).slice(0, 36);
  };
  const partners = selling ? [...ctx.teams.values()].filter((t) => t.rosterId !== owner && !t.isUnowned) : [ctx.teams.get(owner)!];
  const found: FoundTrade[] = [];
  for (const partner of partners) {
    const assets = pool(selling ? partner.rosterId : constraints.rosterId).filter((a) =>
      !selling || input.returns === "any" || (input.returns === "picks" ? a.pick : !a.pick));
    const combos: Asset[][] = [];
    assets.forEach((a, i) => {
      combos.push([a]);
      assets.slice(i + 1).forEach((b) => combos.push([a, b]));
    });
    const candidates = combos.map((combo) => {
      const value = combo.reduce((sum, a) => sum + a.value, 0);
      const proposal: TradeProposal = {
        sideA: { rosterId: constraints.rosterId, gives: selling ? [input.assetKey] : combo.map((a) => a.key) },
        sideB: { rosterId: partner.rosterId, gives: selling ? combo.map((a) => a.key) : [input.assetKey] },
      };
      return { proposal, gap: Math.abs(value - anchorValue) / Math.max(value, anchorValue) };
    }).filter((c) => c.gap <= 0.18 && permittedProposal(c.proposal, ctx, constraints))
      .sort((a, b) => a.gap - b.gap).slice(0, 16);
    for (const { proposal } of candidates) {
      const evaluation = evaluateTrade(proposal, ctx);
      if (!evaluation.isScorable || !evaluation.isValid || !meetsTradeGoal(evaluation, constraints.rosterId, input.goal)) continue;
      if (evaluation.sides?.some((s) => s.capacity.requiredCuts > 1 || (s.lineup && s.lineup.after.unfilledSlots.length > s.lineup.before.unfilledSlots.length))) continue;
      found.push({ proposal, evaluation, score: tradeScore(evaluation, constraints.rosterId, input.goal) });
    }
  }
  found.sort((a, b) => b.score - a.score);
  // Show partner diversity before alternate packages from the same manager.
  const first: FoundTrade[] = [], alternatives: FoundTrade[] = [];
  const seenTeams = new Set<string>(), seenPackages = new Set<string>();
  for (const item of found) {
    const key = proposalKey(item.proposal);
    if (seenPackages.has(key)) continue;
    seenPackages.add(key);
    if (seenTeams.has(item.proposal.sideB.rosterId)) alternatives.push(item);
    else { seenTeams.add(item.proposal.sideB.rosterId); first.push(item); }
  }
  return [...first, ...alternatives].slice(0, 6);
}
