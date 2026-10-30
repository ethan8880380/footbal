import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { AssetFlagMenu } from "@/components/asset-flag-menu";
import { NoTeamNotice, PageHeading, TableSkeleton } from "@/components/page-states";
import { RosterTable } from "@/components/roster/roster-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RECENT_WINDOW_GAMES } from "@/lib/domain/metrics";
import { formatValue } from "@/lib/format";
import { getLeagueModel } from "@/lib/services/league-service";
import { pickRows, rosterRows } from "@/lib/view/roster-view";

export const metadata: Metadata = { title: "My roster" };

export default function RosterPage({ params }: PageProps<"/leagues/[leagueId]/roster">) {
  return (
    <Suspense fallback={<TableSkeleton rows={12} />}>
      <RosterContent params={params} />
    </Suspense>
  );
}

async function RosterContent({ params }: Pick<PageProps<"/leagues/[leagueId]/roster">, "params">) {
  await connection();
  const { leagueId } = await params;
  const model = await getLeagueModel(leagueId);
  if (!model) notFound();
  if (!model.myTeam) return <NoTeamNotice />;

  const rows = rosterRows(model, model.myTeam.rosterId);
  const picks = pickRows(model, model.myTeam.rosterId);
  const counts = { total: rows.length, unscored: rows.filter((r) => r.recommendation === "insufficient").length };

  return (
    <div className="space-y-12">
      <section className="space-y-5">
        <PageHeading
          title={model.myTeam.name}
          meta={`${counts.total} players${counts.unscored ? ` · ${counts.unscored} unscored` : ""} · ${model.statsSeason ? `${model.statsSeason} stats` : "no stats"}`}
        />
        <RosterTable leagueId={leagueId} rows={rows} windowLabel={`last ${RECENT_WINDOW_GAMES}`} />
      </section>

      <section className="space-y-5">
        <PageHeading title="Picks" level={2} meta={`${picks.length} confirmed`} />
        {picks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None confirmed.{" "}
            <Link href={`/leagues/${leagueId}/settings#picks`} className="text-foreground underline underline-offset-4">
              Confirm seasons
            </Link>
          </p>
        ) : (
          <div className="rounded-3xl bg-card px-2 py-1 sm:px-3">
            <Table className="text-[13px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Pick</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Range</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {picks.map((pick) => (
                  <TableRow key={pick.key}>
                    <TableCell className="font-medium">
                      {pick.label}
                      {pick.flag ? <span className="ml-2 rounded-full border border-foreground/20 px-1.5 font-mono text-[10px] tracking-[0.1em] uppercase">{pick.flag}</span> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{pick.isOwn ? "Own" : pick.originalTeam}</TableCell>
                    <TableCell className="num text-right">{formatValue(pick.value)}</TableCell>
                    <TableCell className="num hidden text-right text-muted-foreground sm:table-cell">
                      {pick.range ? `${formatValue(pick.range.late)}–${formatValue(pick.range.early)}` : "—"}
                    </TableCell>
                    <TableCell>
                      <AssetFlagMenu leagueId={leagueId} assetKey={pick.key} flag={pick.flag} label={pick.label} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
