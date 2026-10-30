"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { RecommendationBadge } from "@/components/recommendation-badge";
import { PlayerAvatar } from "@/components/team/player-avatar";
import { DotMeter } from "@/components/viz/dot-meter";
import { Sparkline } from "@/components/viz/sparkline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAge, formatNumber, formatValue, signed } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RECOMMENDATIONS, type Recommendation } from "@/lib/domain/types";
import type { RosterRow } from "@/lib/view/roster-view";

const SORT_KEYS = ["value", "ppg", "age", "name", "usage", "recommendation"] as const;
type SortKey = (typeof SORT_KEYS)[number];
const REC_ORDER: Record<Recommendation, number> = { shop: 0, monitor: 1, keep: 2, insufficient: 3 };
const SLOT_LABELS: Record<string, string> = { starter: "Starter", bench: "Bench", reserve: "IR", taxi: "Taxi" };

interface RosterTableProps {
  leagueId: string;
  rows: RosterRow[];
  windowLabel: string;
}

export function RosterTable({ leagueId, rows, windowLabel }: RosterTableProps) {
  const router = useRouter();
  const [state, setState] = useQueryStates({
    q: parseAsString.withDefault(""),
    pos: parseAsString.withDefault("all"),
    rec: parseAsString.withDefault("all"),
    sort: parseAsStringLiteral(SORT_KEYS).withDefault("value"),
    dir: parseAsStringLiteral(["asc", "desc"] as const).withDefault("desc"),
  });

  const positions = [...new Set(rows.map((r) => r.position))].sort(positionOrder);
  const filtered = rows
    .filter((r) => state.pos === "all" || r.position === state.pos)
    .filter((r) => state.rec === "all" || r.recommendation === state.rec)
    .filter((r) => !state.q || r.name.toLowerCase().includes(state.q.toLowerCase()))
    .sort((a, b) => compare(a, b, state.sort) * (state.dir === "asc" ? 1 : -1));

  const toggleSort = (key: SortKey) =>
    setState({ sort: key, dir: state.sort === key ? (state.dir === "asc" ? "desc" : "asc") : key === "name" ? "asc" : "desc" });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup type="single" size="sm" variant="outline" value={state.pos} onValueChange={(pos) => setState({ pos: pos || "all" })} aria-label="Position">
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            {positions.map((p) => (
              <ToggleGroupItem key={p} value={p}>
                {p}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ToggleGroup type="single" size="sm" variant="outline" value={state.rec} onValueChange={(rec) => setState({ rec: rec || "all" })} aria-label="Recommendation">
            <ToggleGroupItem value="all">Any</ToggleGroupItem>
            {(Object.keys(RECOMMENDATIONS) as Recommendation[]).map((r) => (
              <ToggleGroupItem key={r} value={r}>
                {r === "insufficient" ? "Unscored" : RECOMMENDATIONS[r]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="relative sm:w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={state.q} onChange={(e) => setState({ q: e.target.value || null })} placeholder="Search" className="h-8 pl-8" aria-label="Search players" />
        </div>
      </div>

      <div className="rounded-3xl bg-card px-2 py-1 sm:px-3">
        <Table className="text-[13px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <SortHead label="Player" sortKey="name" state={state} onSort={toggleSort} />
              <TableHead className="hidden md:table-cell">Slot</TableHead>
              <SortHead label="Pts/G" sortKey="ppg" state={state} onSort={toggleSort} className="text-right" />
              <SortHead label={`Usage · ${windowLabel}`} sortKey="usage" state={state} onSort={toggleSort} className="hidden lg:table-cell" />
              <SortHead label="Value · 30d" sortKey="value" state={state} onSort={toggleSort} className="text-right" />
              <SortHead label="Call" sortKey="recommendation" state={state} onSort={toggleSort} className="hidden sm:table-cell" />
              <TableHead className="hidden xl:table-cell">Sources</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => {
              const href = `/leagues/${leagueId}/players/${row.playerId}`;
              return (
                <TableRow key={row.playerId} className="cursor-pointer" onClick={() => router.push(href)}>
                  <TableCell className="max-w-[12rem] whitespace-normal sm:max-w-[18rem]">
                    <div className="flex items-center gap-3">
                      <PlayerAvatar playerId={row.playerId} name={row.name} size={32} className="hidden sm:grid" />
                      <div className="min-w-0">
                        <Link href={href} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline focus-visible:underline focus-visible:outline-none">
                          {row.name}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
                          <span>{row.position}</span>
                          <span>{row.team ?? "FA"}</span>
                          <span className="num">{formatAge(row.age)}</span>
                          {row.injury ? <span className="text-negative">{row.injury}</span> : null}
                          {row.flag ? <span className="rounded-full border border-foreground/20 px-1.5 text-foreground/80">{row.flag === "protected" ? "Protected" : "Available"}</span> : null}
                        </div>
                        <RecommendationBadge recommendation={row.recommendation} className="mt-1.5 sm:hidden" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden font-mono text-[11px] tracking-[0.1em] text-muted-foreground uppercase md:table-cell">{SLOT_LABELS[row.slot] ?? row.slot}</TableCell>
                  <TableCell className="text-right">
                    <div className="num font-medium">
                      {formatNumber(row.ppg)}
                      {row.scoringPartial && row.ppg !== null ? <span title="Some league scoring rules are not modeled for this position" className="text-negative">*</span> : null}
                    </div>
                    <div className="num font-mono text-[10px] text-muted-foreground">
                      {row.gamesPlayed !== null && row.teamGames !== null ? `${row.gamesPlayed}/${row.teamGames} G` : "—"}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex items-center gap-3">
                      <Sparkline values={row.usage} label={`${row.shareLabel} by week`} fromZero />
                      <div>
                        <div className="num">{row.recentShare !== null ? `${formatNumber(row.recentShare)}%` : "—"}</div>
                        <div className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">{row.shareLabel.split(" ")[0]}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-3">
                      {row.valueHistory.length >= 2 ? <Sparkline values={row.valueHistory} label="Market value history" width={56} className="hidden sm:block" /> : null}
                      <div>
                        <div className="num font-medium">{formatValue(row.value)}</div>
                        <div className={cn("num font-mono text-[10px]", (row.change30d ?? 0) < 0 ? "text-negative" : "text-muted-foreground")}>
                          {row.change30d !== null ? signed(row.change30d) : row.value === null ? "UNVALUED" : ""}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={0} className="inline-flex rounded-full focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
                          <RecommendationBadge recommendation={row.recommendation} />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">{row.reason}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex" aria-label={`${row.coverage} of ${row.coverageTotal} sources`}>
                          <DotMeter total={row.coverageTotal} lit={row.coverage} tone={row.coverage < row.coverageTotal ? "muted" : "default"} size="md" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        {row.coverageGaps.length ? row.coverageGaps.join(" ") : "All sources connected for this player."}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  <div className="space-y-3"><p>No matches.</p><Button variant="outline" onClick={() => setState({ q: "", pos: "all", rec: "all" })}>Clear filters</Button></div>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

interface SortHeadProps {
  label: string;
  sortKey: SortKey;
  state: { sort: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  className?: string;
}

function SortHead({ label, sortKey, state, onSort, className }: SortHeadProps) {
  const active = state.sort === sortKey;
  return (
    <TableHead className={className} aria-sort={active ? (state.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(sortKey)} className={cn("inline-flex items-center gap-1 hover:text-foreground", active ? "text-foreground" : "text-muted-foreground")}>
        {label}
        {active ? state.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
      </button>
    </TableHead>
  );
}

function compare(a: RosterRow, b: RosterRow, key: SortKey) {
  const nullsLast = (x: number | null, y: number | null) => (x === null ? (y === null ? 0 : -Infinity) : y === null ? Infinity : x - y);
  switch (key) {
    case "name":
      return a.name.localeCompare(b.name);
    case "age":
      return nullsLast(a.age, b.age);
    case "ppg":
      return nullsLast(a.ppg, b.ppg);
    case "usage":
      return nullsLast(a.recentShare, b.recentShare);
    case "recommendation":
      return REC_ORDER[b.recommendation] - REC_ORDER[a.recommendation];
    default:
      return nullsLast(a.value, b.value);
  }
}

const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DL", "LB", "DB", "?"];
function positionOrder(a: string, b: string) {
  const rank = (p: string) => (POSITION_ORDER.includes(p) ? POSITION_ORDER.indexOf(p) : POSITION_ORDER.length);
  return rank(a) - rank(b);
}
