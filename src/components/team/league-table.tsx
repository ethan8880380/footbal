import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STRATEGIES } from "@/lib/domain/types";
import { formatValue } from "@/lib/format";
import { cn } from "@/lib/utils";
import { teamTier, type LeagueRow } from "@/lib/view/team-board";
import { RankCell } from "./rank-cell";

/** Power-rankings table: one row per team, positional ranks as heat cells. */
export function LeagueTable({ rows, positions }: { rows: LeagueRow[]; positions: string[] }) {
  const teams = rows.length;
  return (
    <Table className="text-sm">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-10">#</TableHead>
          <TableHead>Team</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Value</TableHead>
          <TableHead className="text-center">Lineup</TableHead>
          {positions.map((p) => (
            <TableHead key={p} className="text-center">
              {p}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.rosterId} className={cn("border-foreground/[0.06]", row.isMine && "bg-foreground/[0.05]")}>
            <TableCell className="num font-dot text-lg font-black">{row.valueRank}</TableCell>
            <TableCell className="max-w-[14rem]">
              <span className="flex items-center gap-2">
                {row.isMine ? <span className="size-1.5 shrink-0 rounded-full bg-signal" aria-label="Your team" /> : null}
                <span className={cn("truncate", row.isMine && "font-medium")}>{row.name}</span>
              </span>
              <span className="block font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">{STRATEGIES[row.strategy].split(" ")[0]}</span>
            </TableCell>
            <TableCell className="num hidden text-right font-mono text-xs text-muted-foreground sm:table-cell">{formatValue(row.totalValue)}</TableCell>
            <TableCell className="text-center">
              <RankCell rank={row.lineupRank} tier={teamTier(row.lineupRank, teams)} />
            </TableCell>
            {positions.map((p) => (
              <TableCell key={p} className="px-1 text-center">
                <RankCell rank={row.positionRanks[p]} tier={teamTier(row.positionRanks[p], teams)} className="min-w-8" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
