import "server-only";
import { getWeekProjections } from "@/lib/db/repositories/projection-repository";
import { getSeasonSchedule } from "@/lib/db/repositories/stats-repository";
import { DEMO_LEAGUE_ID } from "@/lib/demo/demo-dataset";
import { sleeperClient } from "@/lib/providers/sleeper/sleeper-client";
import { buildStartSitView, startSitWeeks, type StartSitView } from "@/lib/view/start-sit-view";
import { getLeagueModel } from "./league-service";

export interface StartSitResult {
  hasTeam: boolean;
  isDemo: boolean;
  weeks: number[];
  week: number | null;
  view: StartSitView | null;
}

export async function getStartSit(leagueId: string, requestedWeek: number | null, now = new Date()): Promise<StartSitResult | null> {
  const model = await getLeagueModel(leagueId);
  if (!model) return null;
  const isDemo = leagueId === DEMO_LEAGUE_ID;
  const empty = { hasTeam: true, isDemo, weeks: [] as number[], week: null, view: null };
  if (!model.myTeam) return { ...empty, hasTeam: false };

  const state = isDemo ? null : await sleeperClient.getNflState().catch(() => null);
  const season = state ? Number(state.season) : model.statsSeason;
  if (season === null) return empty;

  const seasonData = model.dataset.seasonData;
  const schedule = seasonData?.season === season ? seasonData.schedule : await getSeasonSchedule(season);
  const weeks = startSitWeeks(schedule, season);
  const firstOpenWeek = weeks.find((w) => schedule.some((g) => g.season === season && g.week === w && g.homeScore === null));
  const fallbackWeek = state && weeks.includes(state.week) ? state.week : firstOpenWeek ?? weeks.at(-1) ?? null;
  const week = requestedWeek !== null && weeks.includes(requestedWeek) ? requestedWeek : fallbackWeek;
  if (week === null) return { ...empty, weeks };

  const rosterId = model.myTeam.rosterId;
  const [matchups, projections] = isDemo
    ? [[], { sleeper: new Map(), props: new Map() }]
    : await Promise.all([sleeperClient.getMatchups(leagueId, week).catch(() => []), getWeekProjections(season, week, model.myTeam.roster.players)]);
  const currentStarters = matchups.find((m) => m.roster_id === rosterId)?.starters ?? null;
  const view = buildStartSitView(model, rosterId, { season, week, schedule, currentStarters, projections, now });
  return { hasTeam: true, isDemo, weeks, week, view };
}
