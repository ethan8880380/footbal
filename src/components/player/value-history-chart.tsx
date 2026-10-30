"use client";

import { DotStack } from "@/components/viz/dot-meter";
import { MonoLabel, Readout } from "@/components/viz/readout";
import { useScrubber } from "@/components/viz/use-scrubber";
import { bucketLast } from "@/lib/dot-scale";
import { formatValue, signed } from "@/lib/format";
import { cn } from "@/lib/utils";

const COLUMNS = 40;
const ROWS = 12;

interface HistoryPoint {
  date: string;
  value: number;
}

/** Each column is one saved value; the lit height spans the series' own min to max. */
export function ValueHistoryChart({ data }: { data: { date: string; value: number | null }[] }) {
  const points = bucketLast(
    data.filter((d): d is HistoryPoint => d.value !== null),
    COLUMNS,
  );
  const { active, surfaceProps, columnProps } = useScrubber(points.length, points.length - 1);
  if (points.length < 2) return null;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const level = (v: number) => (max > min ? 1 + Math.round(((v - min) / (max - min)) * (ROWS - 1)) : Math.ceil(ROWS / 2));
  const current = points[active];
  const delta = current.value - points[0].value;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4" aria-live="polite">
        <div className="space-y-2">
          <MonoLabel className="block">{shortDate(current.date)}</MonoLabel>
          <Readout value={formatValue(current.value)} />
        </div>
        {active > 0 ? (
          <span className="flex items-baseline gap-1.5">
            <MonoLabel>vs {shortDate(points[0].date)}</MonoLabel>
            <span className={cn("num font-dot text-xl leading-none font-black", delta < 0 && "text-negative")}>{signed(delta)}</span>
          </span>
        ) : null}
      </div>

      <div
        {...surfaceProps}
        aria-label="Market value history. Use arrow keys to step through saved values."
        className="space-y-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <div className="flex gap-2">
          <div className="flex w-10 shrink-0 flex-col items-end justify-between" aria-hidden>
            <MonoLabel className="num">{formatValue(max)}</MonoLabel>
            <MonoLabel className="num">{formatValue(min)}</MonoLabel>
          </div>
          <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
            {points.map((p, i) => {
              const isActive = i === active;
              return (
                <div key={p.date} {...columnProps(i)} className={cn("flex justify-center rounded-full py-1.5 transition-colors", isActive && "bg-foreground/[0.05]")}>
                  <DotStack rows={ROWS} lit={level(p.value)} fill={isActive ? "bg-foreground/45" : "bg-foreground/20"} tip={isActive ? "bg-signal" : "bg-foreground"} />
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex justify-between pl-12" aria-hidden>
          <MonoLabel>{shortDate(points[0].date)}</MonoLabel>
          <MonoLabel>{shortDate(points.at(-1)!.date)}</MonoLabel>
        </div>
      </div>

      <ul className="sr-only">
        {points.map((p) => (
          <li key={p.date}>
            {shortDate(p.date)}: {formatValue(p.value)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function shortDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
