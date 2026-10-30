import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ScoreTeam, WeekScore } from "@/lib/view/matchup-view";

/** The week's scoreboard; each game links to its head-to-head view. */
export function WeekScores({ leagueId, scores, week, activeRosterId }: { leagueId: string; scores: WeekScore[]; week: number; activeRosterId: string }) {
  return (
    <section aria-label={`Week ${week} scores`} className="space-y-1 rounded-3xl bg-card p-1.5">
      <h2 className="px-3 pt-2 pb-1 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">Scores</h2>
      <ul className="space-y-1">
        {scores.map(({ matchupId, teams: [a, b] }) => {
          const isActive = a.rosterId === activeRosterId || b?.rosterId === activeRosterId;
          return (
            <li key={matchupId}>
              <Link
                href={`/leagues/${leagueId}/matchup?week=${week}&team=${a.rosterId}`}
                scroll={false}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "block space-y-1 rounded-[1.25rem] px-3 py-2.5 transition-colors hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                  isActive && "bg-foreground/[0.06]",
                )}
              >
                <ScoreLine team={a} leads={!b || a.points >= b.points} />
                {b ? <ScoreLine team={b} leads={b.points >= a.points} /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ScoreLine({ team, leads }: { team: ScoreTeam; leads: boolean }) {
  return (
    <span className="flex items-center gap-2 text-sm">
      {team.isMine ? <span className="size-1.5 shrink-0 rounded-full bg-signal" aria-label="Your team" /> : null}
      <span className={cn("min-w-0 flex-1 truncate", !leads && "text-muted-foreground")}>{team.name}</span>
      <span className={cn("num shrink-0 font-mono", leads ? "font-bold" : "text-muted-foreground")}>{team.points.toFixed(2)}</span>
    </span>
  );
}
