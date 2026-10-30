import type { Tier } from "@/lib/view/team-board";
import { cn } from "@/lib/utils";

export const TIER_STYLES: Record<Tier, string> = {
  elite: "bg-foreground text-background",
  solid: "bg-foreground/25 text-foreground",
  thin: "bg-foreground/[0.08] text-muted-foreground",
  weak: "bg-negative/15 text-negative",
};

interface RankCellProps {
  rank: number | null;
  tier: Tier | null;
  prefix?: string;
  className?: string;
}

/** Heat-graded rank, Flock-style: brighter is better, red is a hole. */
export function RankCell({ rank, tier, prefix = "", className }: RankCellProps) {
  return (
    <span
      className={cn(
        "num inline-flex h-7 min-w-9 shrink-0 items-center justify-center rounded-lg px-1.5 font-mono text-xs font-medium",
        tier ? TIER_STYLES[tier] : "text-muted-foreground",
        className,
      )}
    >
      {rank === null ? "—" : `${prefix}${rank}`}
    </span>
  );
}
