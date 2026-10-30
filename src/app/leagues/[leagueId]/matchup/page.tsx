import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { EmptyState, PageHeading, TableSkeleton } from "@/components/page-states";
import { MatchupBoard } from "@/components/team/matchup-board";
import { MatchupControls } from "@/components/team/matchup-controls";
import { LeagueStandings } from "@/components/team/league-standings";
import { WeekScores } from "@/components/team/week-scores";
import { DEMO_LEAGUE_ID } from "@/lib/demo/demo-dataset";
import { sleeperClient } from "@/lib/providers/sleeper/sleeper-client";
import { getLeagueModel } from "@/lib/services/league-service";
import { buildMatchupView, buildStandings, buildWeekScores, clampWeek, matchupTeams } from "@/lib/view/matchup-view";

export const metadata: Metadata = { title: "Matchup" };

export default function MatchupPage({ params, searchParams }: PageProps<"/leagues/[leagueId]/matchup">) {
  return (
    <Suspense fallback={<TableSkeleton rows={10} />}>
      <MatchupContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function MatchupContent({ params, searchParams }: Pick<PageProps<"/leagues/[leagueId]/matchup">, "params" | "searchParams">) {
  await connection();
  const [{ leagueId }, query] = await Promise.all([params, searchParams]);
  const model = await getLeagueModel(leagueId);
  if (!model) notFound();

  const teams = matchupTeams(model);
  const requestedTeam = typeof query.team === "string" ? query.team : null;
  const rosterId = teams.find((t) => t.rosterId === requestedTeam)?.rosterId ?? model.myTeam?.rosterId ?? teams[0]?.rosterId;
  if (!rosterId) notFound();

  const requestedWeek = typeof query.week === "string" ? Number(query.week) : NaN;
  const week = clampWeek(Number.isFinite(requestedWeek) ? requestedWeek : await currentWeek());
  const isDemo = leagueId === DEMO_LEAGUE_ID;
  const matchups = isDemo ? [] : await sleeperClient.getMatchups(leagueId, week);
  const view = buildMatchupView(model, matchups, rosterId);
  const scores = buildWeekScores(model, matchups);

  return (
    <div className="space-y-6">
      <PageHeading title="Matchup" action={<MatchupControls week={week} rosterId={rosterId} teams={teams} />} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {view ? <MatchupBoard view={view} /> : <EmptyState title="No matchup">{isDemo ? "The demo league has no weekly scores." : "Sleeper has no lineup for this team and week."}</EmptyState>}
        <aside className="hidden space-y-4 lg:sticky lg:top-6 lg:block">
          {scores.length ? <WeekScores leagueId={leagueId} scores={scores} week={week} activeRosterId={rosterId} /> : null}
          <LeagueStandings leagueId={leagueId} rows={buildStandings(model)} week={week} activeRosterId={rosterId} />
        </aside>
      </div>
    </div>
  );
}

async function currentWeek() {
  try {
    return (await sleeperClient.getNflState()).week;
  } catch {
    return 1;
  }
}
