import "server-only";
import { loadLeagueDataset } from "@/lib/analysis/dataset";
import { buildLeagueModel } from "@/lib/analysis/league-model";
import { buildSnapshot } from "@/lib/analysis/changes";
import { saveSnapshot } from "@/lib/db/repositories/history-repository";
import { getLeagueBundle, listLeagues } from "@/lib/db/repositories/league-repository";
import { getLeagueConfig } from "@/lib/db/repositories/settings-repository";
import { analyzeLeagueFormat } from "@/lib/domain/league-format";
import type { StepResult } from "@/lib/ingest/freshness";
import { syncLeague } from "@/lib/ingest/sync-league";
import { syncMarket, syncValueHistory } from "@/lib/ingest/sync-market";
import { syncPlayerProps, syncProjections } from "@/lib/ingest/sync-projections";
import { syncIdentity, syncProspects, syncSleeperPlayers, syncStats } from "@/lib/ingest/sync-sources";
import { MATCHUP_WEEKS } from "@/lib/view/matchup-view";
import { mapLeagueToStatsGuy } from "@/lib/providers/market/stats-guy";
import { resolveSeasons, sleeperClient } from "@/lib/providers/sleeper/sleeper-client";
import { recordSyncRun } from "@/lib/db/repositories/history-repository";

export interface SyncSummary {
  steps: StepResult[];
  historyJob: (() => Promise<number>) | null;
}

/**
 * Full refresh for one league. Each source is independent: a failure is recorded
 * and the remaining sources still sync.
 */
export async function refreshLeague(leagueId: string, options: { force?: boolean; connectedUserId?: string | null } = {}): Promise<SyncSummary> {
  const force = options.force ?? false;
  const steps: StepResult[] = [];

  const existing = await getLeagueBundle(leagueId);
  steps.push(await syncLeague(leagueId, options.connectedUserId ?? existing?.connectedUserId ?? null));

  const state = await sleeperClient.getNflState().catch(() => null);
  if (state) {
    await recordSyncRun({
      scope: "nfl-state",
      key: "sleeper",
      status: "success",
      message: `${state.season} ${state.season_type}, week ${state.week}`,
      dataCutoff: null,
      rowCount: null,
      sourceUrl: "https://api.sleeper.app/v1/state/nfl",
      startedAt: new Date().toISOString(),
    });
  }

  steps.push(await syncSleeperPlayers(force));

  const leagues = await listLeagues();
  const rostered = new Set<string>();
  for (const league of leagues) {
    const bundle = await getLeagueBundle(league.leagueId);
    for (const roster of bundle?.rosters ?? []) roster.players.forEach((id) => rostered.add(id));
  }
  steps.push(await syncIdentity(rostered, force || steps.some((s) => s.scope === "sleeper-players" && s.status === "success")));

  const seasons = state ? resolveSeasons(state) : null;
  const statsSeasons = seasons ? [seasons.statsSeason, seasons.statsSeason - 1] : [new Date().getFullYear() - 1];
  steps.push(...(await syncStats(statsSeasons, force)));
  if (state?.season_type === "regular") {
    const season = Number(state.season);
    steps.push(...(await syncProjections(season, [state.week, state.week + 1].filter((w) => w <= MATCHUP_WEEKS), force)));
    steps.push(await syncPlayerProps(season, force));
  }
  steps.push(await syncProspects(force));

  const bundle = await getLeagueBundle(leagueId);
  let historyJob: SyncSummary["historyJob"] = null;
  if (bundle) {
    const mapping = mapLeagueToStatsGuy(analyzeLeagueFormat(bundle.league), bundle.league.scoringSettings);
    steps.push(await syncMarket(mapping, force));
    const config = await getLeagueConfig(leagueId);
    const mine = bundle.rosters.find((r) => r.rosterId === config.myRosterId)?.players ?? [];
    if (mine.length) historyJob = () => syncValueHistory(mapping, mine);
  }

  const dataset = await loadLeagueDataset(leagueId);
  if (dataset) {
    const model = buildLeagueModel(dataset);
    await saveSnapshot(leagueId, model.myTeam?.rosterId ?? null, buildSnapshot(model));
  }
  return { steps, historyJob };
}

export async function getSeasonOptions() {
  const state = await sleeperClient.getNflState();
  return { state, ...resolveSeasons(state) };
}
