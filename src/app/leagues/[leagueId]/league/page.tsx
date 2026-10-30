import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { NoMarketNotice, PageHeading, TableSkeleton } from "@/components/page-states";
import { LeagueTeams } from "@/components/team/league-teams";
import { getLeagueModel } from "@/lib/services/league-service";
import { boardPositions, leagueBoard, teamBoard, type TeamBoard } from "@/lib/view/team-board";

export const metadata: Metadata = { title: "League" };

export default function LeaguePage({ params }: PageProps<"/leagues/[leagueId]/league">) {
  return (
    <Suspense fallback={<TableSkeleton rows={12} />}>
      <LeagueContent params={params} />
    </Suspense>
  );
}

async function LeagueContent({ params }: Pick<PageProps<"/leagues/[leagueId]/league">, "params">) {
  await connection();
  const { leagueId } = await params;
  const model = await getLeagueModel(leagueId);
  if (!model) notFound();

  const rows = leagueBoard(model);
  const boards: Record<string, TeamBoard> = {};
  for (const row of rows) {
    const board = teamBoard(model, row.rosterId);
    if (board) boards[row.rosterId] = board;
  }

  return (
    <div className="space-y-4">
      <PageHeading title="League" meta={`${rows.length} teams`} />
      {!model.dataset.market ? <NoMarketNotice leagueId={leagueId} /> : null}
      <LeagueTeams leagueId={leagueId} rows={rows.filter((r) => boards[r.rosterId])} positions={boardPositions(model)} boards={boards} />
    </div>
  );
}
