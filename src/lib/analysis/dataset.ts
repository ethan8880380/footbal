import "server-only";
import { getLeagueBundle } from "@/lib/db/repositories/league-repository";
import { getMarketRun, getObservations, getValueHistory } from "@/lib/db/repositories/market-repository";
import { getIdentities, getPlayers } from "@/lib/db/repositories/player-repository";
import { getLeagueConfig, type StoredLeagueConfig } from "@/lib/db/repositories/settings-repository";
import { getProspects, getSeasonData } from "@/lib/db/repositories/stats-repository";
import { listSyncRuns, type SyncRun } from "@/lib/db/repositories/history-repository";
import { analyzeLeagueFormat } from "@/lib/domain/league-format";
import { teamTotalsKey, type SeasonData } from "@/lib/domain/metrics";
import type {
  CombineRecord,
  DraftProspectRecord,
  DraftRecord,
  Evidence,
  IdentityRecord,
  LeagueRecord,
  MappingIssue,
  MarketSnapshot,
  MemberRecord,
  PlayerRecord,
  RosterRecord,
  SourceStatus,
  TradedPickRecord,
  ValueHistoryPoint,
} from "@/lib/domain/types";
import { STATS_GUY, mapLeagueToStatsGuy } from "@/lib/providers/market/stats-guy";
import { NFLVERSE_URLS } from "@/lib/providers/nflverse/nflverse-client";
import { SPORTSGAMEODDS, sportsGameOddsKey } from "@/lib/providers/sportsgameodds/sportsgameodds-client";
import { REFRESH_INTERVALS } from "@/lib/ingest/freshness";
import { aiProviderStatus } from "@/lib/ai/provider";

export interface LeagueDataset {
  mode: "live" | "demo";
  league: LeagueRecord;
  members: MemberRecord[];
  rosters: RosterRecord[];
  drafts: DraftRecord[];
  tradedPicks: TradedPickRecord[];
  players: Map<string, PlayerRecord>;
  identities: Map<string, IdentityRecord>;
  mappingIssues: MappingIssue[];
  seasonData: SeasonData | null;
  previousSeasonData: SeasonData | null;
  prospects: { draft: Map<string, DraftProspectRecord>; combine: Map<string, CombineRecord> };
  market: MarketSnapshot | null;
  marketHistory: Map<string, ValueHistoryPoint[]>;
  importedEvidence: Evidence[];
  config: StoredLeagueConfig;
  sources: SourceStatus[];
  connectedUserId: string | null;
}

export async function loadLeagueDataset(leagueId: string): Promise<LeagueDataset | null> {
  const bundle = await getLeagueBundle(leagueId);
  if (!bundle) return null;

  const rosteredIds = [...new Set(bundle.rosters.flatMap((r) => r.players))];
  const [players, { identities, issues }, config, runs, importedEvidence] = await Promise.all([
    getPlayers(rosteredIds),
    getIdentities(rosteredIds),
    getLeagueConfig(leagueId),
    listSyncRuns(),
    getObservations(rosteredIds),
  ]);

  const statSeasons = runs
    .filter((r) => r.scope === "stats" && (r.status === "success" || r.status === "partial"))
    .map((r) => Number(r.key))
    .sort((a, b) => b - a);
  const gsisIds = [...identities.values()].map((i) => i.gsisId).filter((id): id is string => Boolean(id));
  const pfrIds = [...identities.values()].map((i) => i.pfrId).filter((id): id is string => Boolean(id));

  const loadSeason = async (season: number | undefined): Promise<SeasonData | null> => {
    if (season === undefined) return null;
    const data = await getSeasonData(season, gsisIds, pfrIds);
    const run = runs.find((r) => r.scope === "stats" && r.key === String(season));
    return {
      season,
      schedule: data.schedule,
      statWeeks: data.statWeeks,
      snapWeeks: data.snapWeeks,
      teamTotals: new Map(data.teamTotals.map((t) => [teamTotalsKey(t.gameId, t.team), t])),
      retrievedAt: run?.finishedAt ?? null,
    };
  };

  const format = analyzeLeagueFormat(bundle.league);
  const mapping = mapLeagueToStatsGuy(format, bundle.league.scoringSettings);
  const provider = config.marketProvider === "csv" ? "csv" : STATS_GUY.id;
  const variantKey = provider === "csv" ? "csv" : mapping.variantKey;

  const [seasonData, previousSeasonData, prospects, marketRun, marketHistory] = await Promise.all([
    loadSeason(statSeasons[0]),
    loadSeason(statSeasons[1]),
    getProspects(pfrIds),
    getMarketRun(provider, variantKey),
    getValueHistory(provider, variantKey, rosteredIds),
  ]);

  const market: MarketSnapshot | null = marketRun
    ? {
        provider,
        providerLabel: provider === "csv" ? "CSV import" : STATS_GUY.label,
        variantKey,
        format: provider === "csv" ? "csv" : mapping.variant.format,
        valuedAt: marketRun.run.valuedAt,
        retrievedAt: marketRun.run.retrievedAt,
        sourceUrl: marketRun.run.sourceUrl,
        attribution: provider === "csv" ? null : STATS_GUY.attribution,
        values: marketRun.values,
        picks: marketRun.picks,
        approximations: provider === "csv" ? ["CSV values are applied as imported; confirm they match this league's format."] : mapping.approximations,
      }
    : null;

  return {
    mode: "live",
    league: bundle.league,
    members: bundle.members,
    rosters: bundle.rosters,
    drafts: bundle.drafts,
    tradedPicks: bundle.tradedPicks,
    players,
    identities,
    mappingIssues: issues,
    seasonData,
    previousSeasonData,
    prospects,
    market,
    marketHistory,
    importedEvidence,
    config,
    sources: buildSourceStatuses(runs, leagueId, statSeasons[0], market, provider === "csv" ? "csv" : mapping.variantKey, importedEvidence.length),
    connectedUserId: bundle.connectedUserId,
  };
}

function buildSourceStatuses(
  runs: SyncRun[],
  leagueId: string,
  statsSeason: number | undefined,
  market: MarketSnapshot | null,
  marketKey: string,
  importedCount: number,
): SourceStatus[] {
  const find = (scope: string, key: string) => runs.find((r) => r.scope === scope && r.key === key) ?? null;
  const latest = (scope: string) =>
    runs.filter((r) => r.scope === scope && r.finishedAt).sort((a, b) => b.finishedAt!.localeCompare(a.finishedAt!))[0] ?? null;
  const fromRun = (id: string, label: string, run: SyncRun | null, maxAgeMs: number, fallbackUrl: string | null): SourceStatus => {
    if (!run) return { id, label, state: "unavailable", detail: "Not synced yet.", dataCutoff: null, retrievedAt: null, sourceUrl: fallbackUrl };
    const age = run.finishedAt ? Date.now() - new Date(run.finishedAt).getTime() : Infinity;
    const state: SourceStatus["state"] =
      run.status === "error"
        ? "error"
        : run.status === "unavailable"
          ? "unavailable"
          : run.status === "partial"
            ? "partial"
            : maxAgeMs > 0 && age > maxAgeMs * 2
              ? "stale"
              : "fresh";
    return { id, label, state, detail: run.message ?? "", dataCutoff: run.dataCutoff, retrievedAt: run.finishedAt, sourceUrl: run.sourceUrl ?? fallbackUrl };
  };

  const ai = aiProviderStatus();
  return [
    fromRun("league", "Sleeper league", find("league", leagueId), 24 * 60 * 60 * 1000, "https://docs.sleeper.com/"),
    fromRun("players", "Sleeper player directory", find("sleeper-players", "nfl"), REFRESH_INTERVALS.sleeperPlayers, "https://docs.sleeper.com/#players"),
    fromRun("identity", "Player ID crosswalk", find("identity", "crosswalk"), REFRESH_INTERVALS.identity, NFLVERSE_URLS.crosswalk),
    fromRun(
      "stats",
      statsSeason ? `nflverse ${statsSeason} stats and snaps` : "nflverse stats",
      statsSeason ? find("stats", String(statsSeason)) : null,
      REFRESH_INTERVALS.stats,
      NFLVERSE_URLS.docs,
    ),
    fromRun("schedule", "nflverse schedule and Vegas lines", find("schedule", "nflverse"), REFRESH_INTERVALS.stats, NFLVERSE_URLS.schedule),
    fromRun("projections", "Sleeper weekly projections", latest("projections"), REFRESH_INTERVALS.projections, "https://sleeper.com/"),
    sportsGameOddsKey()
      ? fromRun("props", "Player props (SportsGameOdds)", find("props", SPORTSGAMEODDS.id), REFRESH_INTERVALS.props, SPORTSGAMEODDS.docs)
      : { id: "props", label: "Player props (SportsGameOdds)", state: "unavailable", detail: "Set SPORTSGAMEODDS_API_KEY to pull prop lines.", dataCutoff: null, retrievedAt: null, sourceUrl: SPORTSGAMEODDS.docs },
    fromRun("prospects", "Draft and combine (nflverse)", find("prospects", "nflverse"), REFRESH_INTERVALS.prospects, NFLVERSE_URLS.combine),
    market?.provider === "csv"
      ? { id: "market", label: "Market values (CSV)", state: "fresh", detail: "Imported values.", dataCutoff: market.valuedAt, retrievedAt: market.retrievedAt, sourceUrl: null }
      : fromRun("market", "Stats Guy market values", find("market", marketKey), REFRESH_INTERVALS.market, STATS_GUY.docs),
    {
      id: "advanced",
      label: "Advanced and prospect grades",
      state: importedCount > 0 ? "partial" : "unavailable",
      detail: importedCount > 0 ? `${importedCount} imported observations.` : "No verified source connected. Import a CSV in Settings.",
      dataCutoff: null,
      retrievedAt: null,
      sourceUrl: null,
    },
    {
      id: "news",
      label: "News and context",
      state: "partial",
      detail: "Only dated Sleeper status fields (injury, depth chart, team). No news feed connected.",
      dataCutoff: null,
      retrievedAt: null,
      sourceUrl: "https://docs.sleeper.com/#players",
    },
    { id: "ai", label: "AI explanations", state: ai.enabled ? "fresh" : "unavailable", detail: ai.detail, dataCutoff: null, retrievedAt: null, sourceUrl: null },
  ];
}
