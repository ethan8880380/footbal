import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { NoMarketNotice, PageHeading, TableSkeleton } from "@/components/page-states";
import { DeleteTradeButton } from "@/components/trade/delete-trade-button";
import { TradeLab } from "@/components/trade/trade-lab";
import { Button } from "@/components/ui/button";
import { MonoLabel } from "@/components/viz/readout";
import { listSavedTrades } from "@/lib/db/repositories/history-repository";
import { formatDateTime } from "@/lib/format";
import { getLeagueModel } from "@/lib/services/league-service";
import { tradeCatalog } from "@/lib/view/trade-view";

export const metadata: Metadata = { title: "Trade lab" };

export default function TradeLabPage({ params }: PageProps<"/leagues/[leagueId]/trade-lab">) {
  return (
    <Suspense fallback={<TableSkeleton rows={10} />}>
      <TradeLabContent params={params} />
    </Suspense>
  );
}

async function TradeLabContent({ params }: Pick<PageProps<"/leagues/[leagueId]/trade-lab">, "params">) {
  await connection();
  const { leagueId } = await params;
  const model = await getLeagueModel(leagueId);
  if (!model) notFound();
  const catalog = tradeCatalog(model);
  const saved = await listSavedTrades(leagueId);

  return (
    <div className="space-y-6">
      <PageHeading title="Trade lab" />
      {!model.dataset.market ? <NoMarketNotice leagueId={leagueId} /> : null}
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <TradeLab key={JSON.stringify([model.dataset.config, [...model.dataset.config.flags], model.dataset.sources, catalog])} leagueId={leagueId} teams={catalog.teams} assets={catalog.assets} myRosterId={catalog.myRosterId} />
      </Suspense>

      <section className="space-y-5 pt-6">
        <PageHeading title="Saved" level={2} meta={saved.length ? `${saved.length} packages` : undefined} />
        {saved.length ? (
          <ul className="grid gap-4 md:grid-cols-2">
            {saved.map((trade) => {
              const query = new URLSearchParams({ a: trade.sideARosterId, b: trade.sideBRosterId, ga: trade.sideA.join(","), gb: trade.sideB.join(",") });
              return (
                <li key={trade.id} className="flex flex-col gap-4 rounded-3xl bg-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{trade.name}</p>
                      <MonoLabel className="mt-1.5 block">{formatDateTime(trade.createdAt)}</MonoLabel>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <CopyButton text={trade.summary} label="Copy" />
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/leagues/${leagueId}/trade-lab?${query}`}>Load</Link>
                      </Button>
                      <DeleteTradeButton leagueId={leagueId} id={trade.id} />
                    </div>
                  </div>
                  <pre className="font-sans text-sm whitespace-pre-wrap text-muted-foreground">{trade.summary}</pre>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing saved yet.</p>
        )}
      </section>
    </div>
  );
}
