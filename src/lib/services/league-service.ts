import "server-only";
import { cache } from "react";
import { loadLeagueDataset } from "@/lib/analysis/dataset";
import { buildLeagueModel, type LeagueModel } from "@/lib/analysis/league-model";
import { diffSnapshots, type LeagueSnapshot, type MaterialChange } from "@/lib/analysis/changes";
import { getRecentSnapshots } from "@/lib/db/repositories/history-repository";
import { DEMO_LEAGUE_ID, loadDemoDataset } from "@/lib/demo/demo-dataset";

export const getLeagueModel = cache(async (leagueId: string): Promise<LeagueModel | null> => {
  const dataset = leagueId === DEMO_LEAGUE_ID ? await loadDemoDataset() : await loadLeagueDataset(leagueId);
  return dataset ? buildLeagueModel(dataset) : null;
});

export const getLeagueChanges = cache(async (leagueId: string, model: LeagueModel): Promise<{ changes: MaterialChange[]; since: string | null; until: string | null }> => {
  if (leagueId === DEMO_LEAGUE_ID) return { changes: [], since: null, until: null };
  const [latest, previous] = await getRecentSnapshots(leagueId, 2);
  if (!latest || !previous) return { changes: [], since: previous?.createdAt ?? null, until: latest?.createdAt ?? null };
  const name = (rosterId: string | null) => (rosterId ? model.teamsById.get(rosterId)?.name ?? `Roster ${rosterId}` : "free agency");
  return {
    changes: diffSnapshots(previous.data as LeagueSnapshot, latest.data as LeagueSnapshot, name),
    since: previous.createdAt,
    until: latest.createdAt,
  };
});
