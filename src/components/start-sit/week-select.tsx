"use client";

import { useTransition } from "react";
import { parseAsInteger, useQueryState } from "nuqs";
import { cn } from "@/lib/utils";

export function WeekSelect({ weeks, week }: { weeks: number[]; week: number }) {
  const [isPending, startTransition] = useTransition();
  const [, setWeek] = useQueryState("week", parseAsInteger.withOptions({ shallow: false, scroll: false, startTransition }));
  return (
    <select
      aria-label="Week"
      aria-busy={isPending}
      value={week}
      onChange={(e) => setWeek(Number(e.target.value))}
      className={cn(
        "h-10 rounded-full border border-input bg-card px-4 text-sm font-medium transition-opacity focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        isPending && "opacity-60",
      )}
    >
      {weeks.map((w) => (
        <option key={w} value={w}>
          Week {w}
        </option>
      ))}
    </select>
  );
}
