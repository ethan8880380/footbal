import type { LeagueFormat } from "../league-format";
import { solveLineup } from "../lineup";
import type { MarketSnapshot, Strategy } from "../types";

export interface StrategyEstimateInput {
  rosterId: string;
  playerIds: string[];
  pickValue: number;
}

export interface StrategyEstimate {
  strategy: Strategy;
  evidence: string[];
  starterValue: number;
}

/**
 * Estimates each manager's competitive timeline from roster construction. It is
 * labeled as an estimate everywhere and can be overridden in Settings.
 */
export function estimateStrategies(
  teams: StrategyEstimateInput[],
  ctx: { market: MarketSnapshot | null; format: LeagueFormat; positions: Map<string, { positions: string[]; age: number | null }> },
): Map<string, StrategyEstimate> {
  const result = new Map<string, StrategyEstimate>();
  if (!ctx.market) {
    for (const team of teams) result.set(team.rosterId, { strategy: "balanced", evidence: ["No market values; defaulted to balanced."], starterValue: 0 });
    return result;
  }
  const market = ctx.market;
  const stats = teams.map((team) => {
    const lineup = solveLineup(
      ctx.format.starterSlots,
      team.playerIds.map((id) => ({ playerId: id, positions: ctx.positions.get(id)?.positions ?? [], score: market.values.get(id)?.value ?? null })),
    );
    const valued = team.playerIds
      .map((id) => ({ age: ctx.positions.get(id)?.age ?? null, value: market.values.get(id)?.value ?? null }))
      .filter((p): p is { age: number; value: number } => p.age !== null && p.value !== null)
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
    const weight = valued.reduce((t, p) => t + p.value, 0);
    const age = weight ? valued.reduce((t, p) => t + p.age * p.value, 0) / weight : null;
    const playerValue = team.playerIds.reduce((t, id) => t + (market.values.get(id)?.value ?? 0), 0);
    const pickShare = playerValue + team.pickValue > 0 ? team.pickValue / (playerValue + team.pickValue) : 0;
    return { team, starterValue: lineup.totalScore, age, pickShare };
  });

  const ranked = [...stats].sort((a, b) => b.starterValue - a.starterValue);
  const n = ranked.length;
  ranked.forEach((entry, index) => {
    const rank = index + 1;
    const topThird = rank <= Math.ceil(n / 3);
    const bottomThird = rank > n - Math.ceil(n / 3);
    const young = entry.age !== null && entry.age <= 24.5;
    let strategy: Strategy = "balanced";
    if (topThird && !young) strategy = "contending";
    else if (bottomThird || (young && entry.pickShare >= 0.2)) strategy = "rebuilding";

    result.set(entry.team.rosterId, {
      strategy,
      starterValue: entry.starterValue,
      evidence: [
        `Starting lineup market value ranks ${rank} of ${n}.`,
        entry.age !== null ? `Value-weighted age of top 12 players: ${entry.age.toFixed(1)}.` : "Age data incomplete.",
        `Draft picks are ${Math.round(entry.pickShare * 100)}% of total market value.`,
      ],
    });
  });
  return result;
}
