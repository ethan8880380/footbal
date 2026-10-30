"use client";

import { usePathname, useRouter } from "next/navigation";
import { MATCHUP_WEEKS, type MatchupTeamOption } from "@/lib/view/matchup-view";

const SELECT = "h-10 rounded-full border border-input bg-card px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none";

export function MatchupControls({ week, rosterId, teams }: { week: number; rosterId: string; teams: MatchupTeamOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const go = (next: { week?: number; team?: string }) => router.push(`${pathname}?week=${next.week ?? week}&team=${next.team ?? rosterId}`, { scroll: false });
  return (
    <div className="flex flex-wrap gap-2">
      <select aria-label="Week" value={week} onChange={(e) => go({ week: Number(e.target.value) })} className={SELECT}>
        {Array.from({ length: MATCHUP_WEEKS }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            Week {i + 1}
          </option>
        ))}
      </select>
      <select aria-label="Team" value={rosterId} onChange={(e) => go({ team: e.target.value })} className={`${SELECT} max-w-full min-w-0`}>
        {teams.map((t) => (
          <option key={t.rosterId} value={t.rosterId}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}
