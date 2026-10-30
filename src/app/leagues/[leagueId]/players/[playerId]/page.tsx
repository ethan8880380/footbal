import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { getLeagueModel } from "@/lib/services/league-service";
import { getPlayerValueHistory } from "@/lib/services/value-history-service";
import { aiProviderStatus } from "@/lib/ai/provider";
import { PlayerReport } from "./_components/player-report";

export default function PlayerPage({ params }: PageProps<"/leagues/[leagueId]/players/[playerId]">) {
  return (
    <Suspense fallback={<ReportSkeleton />}>
      <PlayerContent params={params} />
    </Suspense>
  );
}

async function PlayerContent({ params }: Pick<PageProps<"/leagues/[leagueId]/players/[playerId]">, "params">) {
  await connection();
  const { leagueId, playerId } = await params;
  const model = await getLeagueModel(leagueId);
  const player = model?.players.get(playerId);
  if (!model || !player) notFound();
  const history = await getPlayerValueHistory(model, playerId);
  return <PlayerReport model={model} player={player} history={history} aiEnabled={aiProviderStatus().enabled} />;
}

function ReportSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
