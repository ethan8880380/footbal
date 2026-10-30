import { Fragment } from "react";
import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { PageHeading } from "@/components/page-states";
import { PlayerAvatar } from "@/components/team/player-avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MonoLabel, Readout } from "@/components/viz/readout";
import { PROP_MARKETS } from "@/lib/domain/player-props";
import { PROJECTION_SOURCES, PROJECTION_STATUS } from "@/lib/domain/projection";
import { cn } from "@/lib/utils";
import type { StartSitMove, StartSitPlayer, StartSitView } from "@/lib/view/start-sit-view";

const INJURY_LABELS: Record<string, string> = { Questionable: "Q", Doubtful: "D", Out: "O", IR: "IR", Sus: "SUS", PUP: "PUP" };

export function StartSitBoard({ leagueId, view }: { leagueId: string; view: StartSitView }) {
  return (
    <div className="space-y-10">
      <Summary leagueId={leagueId} view={view} />
      <section className="space-y-4">
        <PageHeading level={2} title="Lineup" />
        <PlayerTable leagueId={leagueId} rows={view.slots.map((s, i) => ({ key: `${s.slot}-${i}`, slot: s.label, player: s.player, isChange: s.isChange }))} />
      </section>
      {view.bench.length ? (
        <section className="space-y-4">
          <PageHeading level={2} title="Bench" />
          <PlayerTable leagueId={leagueId} rows={view.bench.map((p) => ({ key: p.playerId, slot: "BN", player: p, isChange: false }))} />
        </section>
      ) : null}
    </div>
  );
}

function Summary({ leagueId, view }: { leagueId: string; view: StartSitView }) {
  const gain = Math.round((view.optimalTotal - view.currentTotal) * 10) / 10;
  return (
    <section aria-label="Projected points" className="space-y-4 rounded-3xl bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
        <div className="flex flex-col gap-2">
          <MonoLabel>Current</MonoLabel>
          <Readout value={view.currentTotal.toFixed(1)} muted={gain > 0} />
        </div>
        <div className="flex flex-col gap-2">
          <MonoLabel>Optimal</MonoLabel>
          <Readout value={view.optimalTotal.toFixed(1)} />
        </div>
      </div>
      {view.moves.length ? (
        <ul className="space-y-1">
          {view.moves.map((move) => (
            <MoveRow key={move.start.playerId} leagueId={leagueId} move={move} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Lineup is optimal.</p>
      )}
    </section>
  );
}

function MoveRow({ leagueId, move }: { leagueId: string; move: StartSitMove }) {
  return (
    <li className="flex items-center gap-3 rounded-[1.25rem] bg-foreground/[0.04] px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <MoveSide leagueId={leagueId} verb="Start" player={move.start} />
        <ArrowRight className="hidden size-4 shrink-0 text-muted-foreground sm:block" aria-hidden />
        {move.sit ? <MoveSide leagueId={leagueId} verb="Sit" player={move.sit} /> : <span className="text-sm text-muted-foreground">Empty slot</span>}
      </div>
      <span className="num shrink-0 font-mono text-sm font-bold">+{move.gain.toFixed(1)}</span>
    </li>
  );
}

function MoveSide({ leagueId, verb, player }: { leagueId: string; verb: "Start" | "Sit"; player: StartSitPlayer }) {
  return (
    <div className="flex min-w-0 items-center gap-2 sm:flex-1">
      <span className={cn("w-9 shrink-0 font-mono text-[10px] font-bold tracking-[0.12em] uppercase", verb === "Start" ? "text-foreground" : "text-muted-foreground")}>{verb}</span>
      <PlayerAvatar playerId={player.playerId} name={player.name} size={24} />
      <Link href={`/leagues/${leagueId}/players/${player.playerId}`} className={cn("truncate text-sm hover:underline", verb === "Sit" && "text-muted-foreground")}>
        {player.name}
      </Link>
      <span className="num shrink-0 font-mono text-xs text-muted-foreground">{formatProjection(player)}</span>
    </div>
  );
}

interface TableRowData {
  key: string;
  slot: string;
  player: StartSitPlayer | null;
  isChange: boolean;
}

function PlayerTable({ leagueId, rows }: { leagueId: string; rows: TableRowData[] }) {
  return (
    <div className="rounded-3xl bg-card px-2 py-1 sm:px-3">
      <Table className="text-[13px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-12">Slot</TableHead>
            <TableHead>Player</TableHead>
            <TableHead className="hidden sm:table-cell">Opp</TableHead>
            <TableHead className="hidden text-right md:table-cell">Spread</TableHead>
            <TableHead className="hidden text-right md:table-cell">Team total</TableHead>
            <TableHead className="text-right">Proj</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell>
                <span
                  className={cn(
                    "inline-flex h-6 min-w-9 items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-medium tracking-[0.06em]",
                    row.isChange ? "bg-signal font-bold text-signal-foreground" : "bg-foreground/[0.06] text-muted-foreground",
                  )}
                >
                  {row.slot}
                </span>
              </TableCell>
              {row.player ? <PlayerCells leagueId={leagueId} player={row.player} /> : <EmptyCells />}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PlayerCells({ leagueId, player }: { leagueId: string; player: StartSitPlayer }) {
  const injury = player.injury ? INJURY_LABELS[player.injury] ?? player.injury : null;
  const { line } = player;
  return (
    <>
      <TableCell className="max-w-[11rem] whitespace-normal sm:max-w-[16rem]">
        <div className="flex items-center gap-3">
          <PlayerAvatar playerId={player.playerId} name={player.name} size={30} className="hidden sm:grid" />
          <div className="min-w-0">
            <Link href={`/leagues/${leagueId}/players/${player.playerId}`} className="font-medium hover:underline focus-visible:underline focus-visible:outline-none">
              {player.name}
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
              <span>{player.position ?? "—"}</span>
              <span>{player.team ?? "FA"}</span>
              {line ? <span className="sm:hidden">{opponentLabel(player)}</span> : null}
              {injury ? <span className="text-negative">{injury}</span> : null}
              {player.isLocked ? <Lock className="size-3 sm:hidden" aria-label="Locked" /> : null}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        {line ? (
          <div>
            <div className="flex items-center gap-1.5 font-medium">
              {opponentLabel(player)}
              {player.isLocked ? <Lock className="size-3 text-muted-foreground" aria-label="Locked" /> : null}
            </div>
            <div className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground uppercase">{line.isFinal ? "Final" : formatKickoff(line.kickoff)}</div>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="num hidden text-right md:table-cell">{formatSpread(line?.spread ?? null)}</TableCell>
      <TableCell className="num hidden text-right md:table-cell">{line?.implied != null ? line.implied.toFixed(1) : "—"}</TableCell>
      <TableCell className="text-right">
        <ProjectionCell player={player} />
      </TableCell>
    </>
  );
}

function EmptyCells() {
  return (
    <>
      <TableCell className="text-muted-foreground">Empty</TableCell>
      <TableCell className="hidden sm:table-cell" />
      <TableCell className="hidden md:table-cell" />
      <TableCell className="hidden md:table-cell" />
      <TableCell className="text-right text-muted-foreground">—</TableCell>
    </>
  );
}

function ProjectionCell({ player }: { player: StartSitPlayer }) {
  if (player.status !== "projected" || player.projection === null) {
    return <span className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">{PROJECTION_STATUS[player.status]}</span>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex flex-col items-end rounded-md focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
          <span className="num font-medium">{player.projection.toFixed(1)}</span>
          <SourceTag player={player} />
        </span>
      </TooltipTrigger>
      <TooltipContent className="font-mono text-[11px]">
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5">
          {breakdown(player).map(([label, value]) => (
            <Fragment key={label}>
              <dt>{label}</dt>
              <dd className="num text-right">{value}</dd>
            </Fragment>
          ))}
          {player.availability < 1 ? (
            <>
              <dt>{player.injury}</dt>
              <dd className="num text-right">×{player.availability.toFixed(2)}</dd>
            </>
          ) : null}
        </dl>
      </TooltipContent>
    </Tooltip>
  );
}

function SourceTag({ player }: { player: StartSitPlayer }) {
  if (player.source !== "model") {
    return <span className={cn("font-mono text-[10px] tracking-[0.08em] uppercase", player.source === "props" ? "text-foreground" : "text-muted-foreground")}>{player.source ? PROJECTION_SOURCES[player.source] : ""}</span>;
  }
  const vegasPct = Math.round((player.vegas - 1) * 100);
  return (
    <span className={cn("num font-mono text-[10px]", vegasPct > 0 ? "text-foreground" : vegasPct < 0 ? "text-negative" : "text-muted-foreground")}>
      {vegasPct === 0 ? "±0%" : `${vegasPct > 0 ? "+" : ""}${vegasPct}%`}
    </span>
  );
}

function breakdown(player: StartSitPlayer): [string, string][] {
  if (player.source === "props") {
    return player.lines.map((l) => [
      PROP_MARKETS[l.market].label,
      l.line === null ? `${Math.round((l.overProbability ?? 0) * 100)}%` : `${l.line}${l.overProbability !== null ? ` · o${Math.round(l.overProbability * 100)}%` : ""}`,
    ]);
  }
  if (player.source === "sleeper") return player.contributions.map((c) => [c.label, `${formatStat(c.value)} → ${c.points.toFixed(1)}`]);
  return [
    ["Form", player.form?.toFixed(1) ?? "—"],
    ["Vegas", `×${player.vegas.toFixed(2)}`],
  ];
}

function formatStat(value: number) {
  return value >= 10 ? value.toFixed(0) : value.toFixed(1);
}

const KICKOFF = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" });

function formatKickoff(iso: string | null) {
  return iso ? `${KICKOFF.format(new Date(iso))} ET` : "—";
}

function opponentLabel(player: StartSitPlayer) {
  return player.line ? `${player.line.isHome ? "vs" : "@"} ${player.line.opponent}` : "";
}

function formatSpread(spread: number | null) {
  if (spread === null) return "—";
  if (spread === 0) return "PK";
  return spread > 0 ? `+${spread}` : `${spread}`;
}

function formatProjection(player: StartSitPlayer) {
  return player.status === "projected" && player.projection !== null ? player.projection.toFixed(1) : PROJECTION_STATUS[player.status];
}
