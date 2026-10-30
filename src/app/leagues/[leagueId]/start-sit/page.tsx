import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { EmptyState, NoTeamNotice, Notice, PageHeading, TableSkeleton } from "@/components/page-states";
import { StartSitBoard } from "@/components/start-sit/start-sit-board";
import { WeekSelect } from "@/components/start-sit/week-select";
import { getStartSit } from "@/lib/services/start-sit-service";

export const metadata: Metadata = { title: "Start / Sit" };

export default function StartSitPage({ params, searchParams }: PageProps<"/leagues/[leagueId]/start-sit">) {
  return (
    <Suspense fallback={<TableSkeleton rows={12} />}>
      <StartSitContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function StartSitContent({ params, searchParams }: Pick<PageProps<"/leagues/[leagueId]/start-sit">, "params" | "searchParams">) {
  await connection();
  const [{ leagueId }, query] = await Promise.all([params, searchParams]);
  const requestedWeek = typeof query.week === "string" ? Number(query.week) : NaN;
  const result = await getStartSit(leagueId, Number.isInteger(requestedWeek) ? requestedWeek : null);
  if (!result) notFound();
  if (!result.hasTeam) return <NoTeamNotice />;

  const { view, weeks, week, isDemo } = result;
  const missing = view
    ? [
        !isDemo && view.sourceCounts.props + view.sourceCounts.sleeper === 0 ? "projections" : null,
        view.linedGames < view.games ? `Vegas lines for ${view.games - view.linedGames} of ${view.games} games` : null,
      ].filter(Boolean)
    : [];
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeading title="Start / Sit" action={week !== null ? <WeekSelect weeks={weeks} week={week} /> : null} />
      {view && missing.length ? <Notice title={`Week ${view.week} is missing ${missing.join(" and ")}`}>Sync to pull the latest.</Notice> : null}
      {view ? <StartSitBoard leagueId={leagueId} view={view} /> : <EmptyState title="No schedule">Sync the league to load this season&apos;s games.</EmptyState>}
    </div>
  );
}
