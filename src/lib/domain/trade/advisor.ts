import type { AssetFlag, PickBudget } from "../types";
import { parseAssetKey, playerKey, valueSide } from "../valuation";
import { evaluateTrade, type TradeEvaluation } from "./evaluate";
import type { TradeContext, TradeProposal } from "./types";
import { validateTrade } from "./validate";

export type TradeGoal = "fit" | "lineup" | "value";
export interface AdvisorConstraints {
  rosterId: string;
  flags: Map<string, AssetFlag>;
  pickBudget: PickBudget;
}

export function permittedProposal(proposal: TradeProposal, ctx: TradeContext, constraints: AdvisorConstraints) {
  if (validateTrade(proposal, ctx).length) return false;
  if ([proposal.sideA, proposal.sideB].some((s) => ctx.teams.get(s.rosterId)?.isUnowned)) return false;
  const mine = [proposal.sideA, proposal.sideB].find((s) => s.rosterId === constraints.rosterId);
  if (!mine) return false;
  const picks = mine.gives.flatMap((key) => {
    const parsed = parseAssetKey(key);
    return parsed?.kind === "pick" ? [parsed] : [];
  });
  return ![...proposal.sideA.gives, ...proposal.sideB.gives].some((key) => constraints.flags.get(key) === "protected") &&
    picks.length <= constraints.pickBudget.maxPicks &&
    (constraints.pickBudget.allowFirsts || !picks.some((p) => p.round === 1));
}

export function proposalKey(proposal: TradeProposal) {
  return JSON.stringify([proposal.sideA.rosterId, [...proposal.sideA.gives].sort(), proposal.sideB.rosterId, [...proposal.sideB.gives].sort()]);
}

export function tradeScore(evaluation: TradeEvaluation, rosterId: string, goal: TradeGoal) {
  const mine = evaluation.sides?.find((s) => s.rosterId === rosterId);
  if (!mine) return -Infinity;
  const delta = mine.lineup ? (mine.lineup.starterValueAfter - mine.lineup.starterValueBefore) / Math.max(1, mine.lineup.starterValueBefore) : 0;
  const value = (mine.netAdjusted ?? 0) / Math.max(1, mine.gives.adjusted ?? 0);
  const fit = evaluation.sides!.reduce((sum, side) => sum + (side.timeline.fit === "good" ? 1 : side.timeline.fit === "poor" ? -2 : 0), 0);
  return delta * (goal === "lineup" ? 12 : 4) + value * (goal === "value" ? 6 : 2) + fit * 0.3 - Math.abs(evaluation.valueGap?.share ?? 1) * 2;
}

export function meetsTradeGoal(evaluation: TradeEvaluation, rosterId: string, goal: TradeGoal) {
  const mine = evaluation.sides?.find((s) => s.rosterId === rosterId);
  if (!mine) return false;
  if (goal === "lineup") return Boolean(mine.lineup && mine.lineup.starterValueAfter > mine.lineup.starterValueBefore);
  if (goal === "value") return (mine.netAdjusted ?? 0) > 0;
  return true;
}

/** Bounded search of single edits. Incoming centerpiece stays in every counteroffer. */
export function counteroffers(proposal: TradeProposal, ctx: TradeContext, constraints: AdvisorConstraints, goal: TradeGoal) {
  if (!ctx.market || validateTrade(proposal, ctx).length) return [];
  const originalKey = proposalKey(proposal);
  const candidates = new Map<string, TradeProposal>();
  const add = (p: TradeProposal) => {
    const key = proposalKey(p);
    if (key !== originalKey && permittedProposal(p, ctx, constraints)) candidates.set(key, p);
  };
  for (const sideName of ["sideA", "sideB"] as const) {
    const side = proposal[sideName];
    const own = ctx.teams.get(side.rosterId)!;
    const pool = [...own.playerIds.map(playerKey), ...[...ctx.picksByKey.values()].filter((p) => p.ownerRosterId === side.rosterId).map((p) => p.key)]
      .filter((key) => !side.gives.includes(key) && constraints.flags.get(key) !== "protected")
      .map((key) => ({ key, value: valueSide([key], ctx.market!, ctx.picksByKey, ctx.exponent).adjusted }))
      .filter((a): a is { key: string; value: number } => a.value !== null)
      .sort((a, b) => b.value - a.value).slice(0, 24);
    const replace = (gives: string[]) => add({ ...proposal, [sideName]: { ...side, gives } });
    for (const asset of pool) {
      if (side.gives.length < 4) replace([...side.gives, asset.key]);
      // Keep all requested incoming assets; swap only the user's outgoing assets.
      if (side.rosterId === constraints.rosterId) {
        for (let i = 0; i < side.gives.length; i++) replace(side.gives.map((key, j) => j === i ? asset.key : key));
      }
    }
    if (side.rosterId === constraints.rosterId && side.gives.length > 1) {
      side.gives.forEach((_, i) => replace(side.gives.filter((_, j) => j !== i)));
    }
  }
  // Cheap value checks precede the lineup solver.
  return [...candidates.values()].map((p) => {
    const a = valueSide(p.sideA.gives, ctx.market!, ctx.picksByKey, ctx.exponent).adjusted;
    const b = valueSide(p.sideB.gives, ctx.market!, ctx.picksByKey, ctx.exponent).adjusted;
    return { proposal: p, gap: a !== null && b !== null && Math.max(a, b) > 0 ? Math.abs(a - b) / Math.max(a, b) : 1 };
  }).filter((p) => p.gap <= 0.22).sort((a, b) => a.gap - b.gap).slice(0, 40)
    .map(({ proposal: p }) => ({ proposal: p, evaluation: evaluateTrade(p, ctx) }))
    .filter(({ evaluation: e }) => e.isValid && e.isScorable && meetsTradeGoal(e, constraints.rosterId, goal) && e.sides?.every((s) => s.capacity.requiredCuts <= 1))
    .sort((a, b) => tradeScore(b.evaluation, constraints.rosterId, goal) - tradeScore(a.evaluation, constraints.rosterId, goal)).slice(0, 12);
}
