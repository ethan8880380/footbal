import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { NoMarketNotice, NoTeamNotice, CardsSkeleton, PageHeading } from "@/components/page-states";
import { LeagueTable } from "@/components/team/league-table";
import { PlayerAvatar } from "@/components/team/player-avatar";
import { RosterBoard } from "@/components/team/roster-board";
import { TeamHeader } from "@/components/team/team-header";
import { MonoLabel } from "@/components/viz/readout";
import { Widget } from "@/components/widget";
import { AdvisorPanel } from "@/components/league/advisor-panel";
import { leagueTargets } from "@/lib/analysis/targets";
import { STRATEGIES } from "@/lib/domain/types";
import { formatDateTime, formatValue } from "@/lib/format";
import { getLeagueChanges, getLeagueModel } from "@/lib/services/league-service";
import { cn } from "@/lib/utils";
import { boardPositions, leagueBoard, teamBoard } from "@/lib/view/team-board";

export default function OverviewPage({ params }: PageProps<"/leagues/[leagueId]">) {
  return (
    <Suspense fallback={<CardsSkeleton count={6} />}>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: Pick<PageProps<"/leagues/[leagueId]">, "params">) {
  await connection();
  const { leagueId } = await params;
  const model = await getLeagueModel(leagueId);
  if (!model) notFound();
  const me = model.myTeam;
  const base = `/leagues/${leagueId}`;
  const board = me ? teamBoard(model, me.rosterId) : null;
  const targets = leagueTargets(model);
  const { changes, since, until } = await getLeagueChanges(leagueId, model);
  const shopCount = board?.groups.flatMap((g) => g.players).filter((p) => p.recommendation === "shop").length ?? 0;
  const format = [`${model.format.teams} teams`, model.format.isSuperflex ? "Superflex" : "1QB", model.format.scoringLabel, model.format.isIdp ? "IDP" : null].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      {!me ? <PageHeading title={model.dataset.league.name} meta={format} /> : null}
      {!me ? <NoTeamNotice /> : null}
      {!model.dataset.market ? <NoMarketNotice leagueId={leagueId} /> : null}

      {me && board ? (
        <>
          <TeamHeader
            name={me.name}
            meta={format}
            groups={board.groups}
            teams={board.teams}
            stats={[
              { label: "Value", value: <>#{board.valueRank}</> },
              { label: "Lineup", value: <>#{board.lineupRank}</> },
              { label: "Shop", value: shopCount, negative: shopCount > 0 },
              { label: "Plan", value: STRATEGIES[me.strategy].split(" ")[0] },
            ]}
          />
          <AdvisorPanel key={JSON.stringify([model.dataset.config, [...model.dataset.config.flags], model.dataset.sources, model.dataset.market?.valuedAt, until])} leagueId={leagueId} />
          <RosterBoard leagueId={leagueId} board={board} />
        </>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Widget label="League">
          <LeagueTable rows={leagueBoard(model)} positions={boardPositions(model)} />
        </Widget>

        <div className="space-y-4">
          {me ? (
            <Widget label="Targets" href={`${base}/targets`} linkLabel="All targets">
              {targets?.targets.length ? (
                <ul className="-mx-2">
                  {targets.targets.slice(0, 4).map((t) => {
                    const player = model.players.get(t.playerId);
                    return (
                      <li key={t.playerId}>
                        <Link href={`${base}/players/${t.playerId}`} className="flex items-center gap-2.5 rounded-2xl px-2 py-1.5 transition-colors hover:bg-foreground/[0.05]">
                          <PlayerAvatar playerId={t.playerId} name={player?.name ?? "?"} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{player?.name}</span>
                            <MonoLabel className="block truncate">
                              {t.position} · {t.ownerName}
                            </MonoLabel>
                          </span>
                          <span className="num font-mono text-xs">{formatValue(t.value)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">None right now.</p>
              )}
            </Widget>
          ) : null}

          <Widget label="What changed">
            {changes.length ? (
              <ul className="space-y-2.5 text-sm">
                {changes.slice(0, 6).map((c) => (
                  <li key={`${c.kind}-${c.subjectId}`} className="flex items-baseline justify-between gap-3">
                    <span className={cn("flex min-w-0 items-center gap-2", c.mine ? "font-medium" : "text-muted-foreground")}>
                      <span className={cn("size-1.5 shrink-0 rounded-full", c.mine ? "bg-signal" : "bg-foreground/30")} aria-hidden />
                      <span className="truncate">{c.title.startsWith("pick:") ? "Draft pick" : c.title}</span>
                    </span>
                    <span className="shrink-0 text-right font-mono text-[10px] text-muted-foreground uppercase">{c.detail}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{since ? "Nothing since the last sync." : "Shows up after the next sync."}</p>
            )}
            {since && until ? (
              <MonoLabel className="mt-4 block">
                {formatDateTime(since)} → {formatDateTime(until)}
              </MonoLabel>
            ) : null}
          </Widget>
        </div>
      </div>
    </div>
  );
}
