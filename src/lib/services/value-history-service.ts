import "server-only";
import type { LeagueModel } from "@/lib/analysis/league-model";
import { getValueHistory, latestProviderHistoryFetch, saveProviderHistory } from "@/lib/db/repositories/market-repository";
import type { ValueHistoryPoint } from "@/lib/domain/types";
import { STATS_GUY, fetchStatsGuyHistory, mapLeagueToStatsGuy } from "@/lib/providers/market/stats-guy";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Fills one player's provider history on demand, at most daily. Failures fall back to stored points. */
export async function getPlayerValueHistory(model: LeagueModel, playerId: string): Promise<ValueHistoryPoint[]> {
  const market = model.dataset.market;
  if (!market || model.dataset.mode === "demo") return model.dataset.marketHistory.get(playerId) ?? [];
  if (market.provider === STATS_GUY.id) {
    const mapping = mapLeagueToStatsGuy(model.format, model.dataset.league.scoringSettings);
    const last = await latestProviderHistoryFetch(STATS_GUY.id, mapping.variantKey, playerId);
    if (!last || Date.now() - new Date(last).getTime() > MAX_AGE_MS) {
      try {
        const history = await fetchStatsGuyHistory(playerId, mapping.variant);
        await saveProviderHistory(STATS_GUY.id, mapping.variantKey, playerId, history);
      } catch {
        // Keep whatever history is already stored.
      }
    }
  }
  return (await getValueHistory(market.provider, market.variantKey, [playerId])).get(playerId) ?? [];
}
