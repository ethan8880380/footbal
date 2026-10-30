"use client";

import { DotStack } from "@/components/viz/dot-meter";
import { MonoLabel, Readout } from "@/components/viz/readout";
import { useScrubber } from "@/components/viz/use-scrubber";
import { PERCENT_STEPS, litDots, niceStep } from "@/lib/dot-scale";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface WeeklyPoint {
  week: number;
  status: string;
  statusLabel: string;
  points: number | null;
  share: number | null;
}

interface WeeklyChartProps {
  data: WeeklyPoint[];
  shareLabel: string;
}

const POINT_ROWS = 10;
const SHARE_ROWS = 7;

/** Points rise above the week row, usage share hangs below it; red marks the selected week. */
export function WeeklyChart({ data, shareLabel }: WeeklyChartProps) {
  const { active, surfaceProps, columnProps } = useScrubber(data.length, Math.max(0, data.findLastIndex((d) => d.status === "played")));
  const points = scale(data.map((d) => d.points), POINT_ROWS);
  const share = scale(data.map((d) => d.share), SHARE_ROWS, PERCENT_STEPS);
  const current = data[active];
  const played = current.status === "played";

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4" aria-live="polite">
        <div className="space-y-2">
          <MonoLabel className="block">Week {current.week}</MonoLabel>
          <Readout value={played && current.points !== null ? formatNumber(current.points) : "—"} unit={played ? "pts" : current.statusLabel} />
        </div>
        <Readout value={current.share !== null ? `${formatNumber(current.share)}%` : "—"} unit={shareLabel} muted className="flex-row-reverse" />
      </div>

      <div
        {...surfaceProps}
        aria-label={`Weekly fantasy points and ${shareLabel.toLowerCase()}. Use arrow keys to step through weeks.`}
        className="flex gap-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <div className="flex w-7 shrink-0 flex-col items-end gap-2 py-2" aria-hidden>
          <Gutter rows={points.rows} label={formatNumber(points.top)} />
          <MonoLabel className="invisible">0</MonoLabel>
          <Gutter rows={share.rows} label={`${formatNumber(share.top)}%`} hanging />
        </div>
        <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
          {data.map((d, i) => {
            const isActive = i === active;
            return (
              <div key={d.week} {...columnProps(i)} className={cn("flex flex-col items-center gap-2 rounded-full py-2 transition-colors", isActive && "bg-foreground/[0.05]")}>
                <DotStack rows={points.rows} lit={litDots(d.points, points.step, points.rows)} tip={isActive ? "bg-signal" : undefined} />
                <MonoLabel className={cn("num", isActive && "text-foreground")}>{d.status === "played" ? d.week : d.status === "bye" ? "B" : "–"}</MonoLabel>
                <DotStack rows={share.rows} lit={litDots(d.share, share.step, share.rows)} fill="bg-foreground/35" tip={isActive ? "bg-signal" : undefined} hanging />
              </div>
            );
          })}
        </div>
      </div>

      <ul className="sr-only">
        {data.map((d) => (
          <li key={d.week}>
            Week {d.week}: {d.status === "played" ? `${formatNumber(d.points)} points, ${shareLabel.toLowerCase()} ${d.share !== null ? `${formatNumber(d.share)}%` : "unknown"}` : d.statusLabel}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Gutter({ rows, label, hanging = false }: { rows: number; label: string; hanging?: boolean }) {
  return (
    <span className="relative">
      <DotStack rows={rows} lit={0} className="invisible" />
      <MonoLabel className={cn("num absolute right-0", hanging ? "bottom-0" : "top-0")}>{label}</MonoLabel>
    </span>
  );
}

function scale(values: (number | null)[], maxRows: number, steps?: number[]) {
  const max = Math.max(0, ...values.map((v) => v ?? 0));
  const step = niceStep(max / maxRows, steps);
  const rows = Math.max(1, Math.min(maxRows, Math.ceil(max / step)));
  return { step, rows, top: rows * step };
}
