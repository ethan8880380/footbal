import Link from "next/link";
import { cn } from "@/lib/utils";
import type { StandingRow } from "@/lib/view/matchup-view";

export function LeagueStandings({ leagueId, rows, week, activeRosterId }: { leagueId: string; rows: StandingRow[]; week: number; activeRosterId: string }) {
  return (
    <section aria-label="Standings" className="rounded-3xl bg-card p-1.5">
      <h2 className="px-3 pt-2 pb-1 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">Standings</h2>
      <ol>
        {rows.map((row, i) => (
          <li key={row.rosterId}>
            <Link
              href={`/leagues/${leagueId}/matchup?week=${week}&team=${row.rosterId}`}
              scroll={false}
              aria-current={row.rosterId === activeRosterId ? "true" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-[1.25rem] px-3 py-1.5 text-sm transition-colors hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                row.rosterId === activeRosterId && "bg-foreground/[0.06]",
              )}
            >
              <span className="num w-5 shrink-0 font-mono text-xs text-muted-foreground">{i + 1}</span>
              {row.isMine ? <span className="size-1.5 shrink-0 rounded-full bg-signal" aria-label="Your team" /> : null}
              <span className={cn("min-w-0 flex-1 truncate", row.isMine && "font-medium")}>{row.name}</span>
              <span className="num shrink-0 font-mono text-xs">{row.record}</span>
              <span className="num w-14 shrink-0 text-right font-mono text-xs text-muted-foreground">{row.pointsFor.toFixed(0)}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
