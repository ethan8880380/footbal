import { ChevronDown } from "lucide-react";
import { STRATEGIES } from "@/lib/domain/types";
import { formatValue } from "@/lib/format";
import { cn } from "@/lib/utils";
import { teamTier, type LeagueRow, type TeamBoard } from "@/lib/view/team-board";
import { RankCell } from "./rank-cell";
import { RosterBoard } from "./roster-board";

interface LeagueTeamsProps {
  leagueId: string;
  rows: LeagueRow[];
  positions: string[];
  boards: Record<string, TeamBoard>;
}

/** Every team as a power-rankings row that expands into its full roster board. */
export function LeagueTeams({ leagueId, rows, positions, boards }: LeagueTeamsProps) {
  const teams = rows.length;
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.rosterId}>
          <details className="group rounded-3xl bg-card p-1.5 open:pb-2">
            <summary className="flex cursor-pointer list-none items-center gap-3 rounded-[1.25rem] px-3 py-2.5 transition-colors select-none hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
              <span className="num w-7 shrink-0 font-dot text-lg font-black">{row.valueRank}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  {row.isMine ? <span className="size-1.5 shrink-0 rounded-full bg-signal" aria-label="Your team" /> : null}
                  <span className={cn("truncate text-sm", row.isMine && "font-medium")}>{row.name}</span>
                </span>
                <span className="block font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">{STRATEGIES[row.strategy].split(" ")[0]}</span>
              </span>
              <span className="num hidden font-mono text-xs text-muted-foreground sm:block">{formatValue(row.totalValue)}</span>
              <RankCell rank={row.lineupRank} tier={teamTier(row.lineupRank, teams)} />
              <span className="hidden gap-1 md:flex">
                {positions.map((p) => (
                  <RankCell key={p} rank={row.positionRanks[p]} tier={teamTier(row.positionRanks[p], teams)} className="min-w-8" />
                ))}
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="px-1 pt-2">
              <RosterBoard leagueId={leagueId} board={boards[row.rosterId]} />
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
