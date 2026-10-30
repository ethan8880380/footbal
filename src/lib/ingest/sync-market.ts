import { latestProviderHistoryFetch, saveMarketRun, saveProviderHistory } from "@/lib/db/repositories/market-repository";
import {
  STATS_GUY,
  fetchStatsGuyHistory,
  fetchStatsGuyPicks,
  fetchStatsGuyPlayers,
  type MarketMapping,
} from "@/lib/providers/market/stats-guy";
import { REFRESH_INTERVALS, isFresh, runStep } from "./freshness";

export async function syncMarket(mapping: MarketMapping, force = false) {
  if (!force && (await isFresh("market", mapping.variantKey, REFRESH_INTERVALS.market))) {
    return { scope: "market", key: mapping.variantKey, status: "skipped" as const, message: null };
  }
  return runStep("market", mapping.variantKey, async () => {
    const players = await fetchStatsGuyPlayers(mapping.variant);
    const picks = mapping.variant.format.endsWith("dynasty") ? await fetchStatsGuyPicks(mapping.variant) : { picks: [], valuedAt: null };
    await saveMarketRun({
      provider: STATS_GUY.id,
      variantKey: mapping.variantKey,
      sourceUrl: players.sourceUrl,
      valuedAt: players.valuedAt,
      values: players.players,
      picks: picks.picks,
    });
    return {
      rowCount: players.players.length,
      dataCutoff: players.valuedAt,
      sourceUrl: players.sourceUrl,
      message: `${players.players.length} player values and ${picks.picks.length} pick values.`,
    };
  });
}

const HISTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Fetches provider value history for a bounded set of players, within the provider's rate limit. */
export async function syncValueHistory(mapping: MarketMapping, playerIds: string[], limit = 40) {
  let fetched = 0;
  for (const playerId of playerIds.slice(0, limit)) {
    const last = await latestProviderHistoryFetch(STATS_GUY.id, mapping.variantKey, playerId);
    if (last && Date.now() - new Date(last).getTime() < HISTORY_MAX_AGE_MS) continue;
    try {
      const history = await fetchStatsGuyHistory(playerId, mapping.variant);
      await saveProviderHistory(STATS_GUY.id, mapping.variantKey, playerId, history);
      fetched++;
    } catch {
      // A missing history for one player should not stop the rest.
    }
  }
  return fetched;
}
