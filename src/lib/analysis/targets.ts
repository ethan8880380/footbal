import { findTradeTargets, type TargetPlayerInfo } from "@/lib/domain/trade/targets";
import type { LeagueModel } from "./league-model";

export function leagueTargets(model: LeagueModel) {
  if (!model.myTeam || !model.dataset.market) return null;
  const info = new Map<string, TargetPlayerInfo>();
  for (const p of model.players.values()) {
    info.set(p.playerId, {
      recommendation: p.recommendation.recommendation,
      productionPercentile: p.productionPercentile,
      headline: p.recommendation.headline,
      strengths: p.recommendation.strengths,
      concerns: p.recommendation.concerns,
      evidenceStrength: p.recommendation.evidenceStrength,
      isMyStarter: p.isOwnerStarter,
    });
  }
  const { config } = model.dataset;
  return findTradeTargets({
    ctx: model.tradeContext,
    myRosterId: model.myTeam.rosterId,
    strategy: config.strategy,
    targetPositions: config.targetPositions,
    pickBudget: config.pickBudget,
    flags: config.flags,
    info,
  });
}
