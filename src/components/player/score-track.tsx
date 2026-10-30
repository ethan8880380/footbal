import { DOT_OFF } from "@/components/viz/dot-meter";
import { MonoLabel } from "@/components/viz/readout";
import { RECOMMENDATION_THRESHOLDS } from "@/lib/domain/recommendations";
import { signed } from "@/lib/format";
import { cn } from "@/lib/utils";

const MIN = -3;
const STEP = 0.25;
const DOTS = 25;

/** Score on a dot track; the shop and keep zones are tinted so the call reads without the thresholds spelled out. */
export function ScoreTrack({ score }: { score: number }) {
  const marker = Math.min(DOTS - 1, Math.max(0, Math.round((score - MIN) / STEP)));
  const zone = (i: number) => {
    const value = MIN + i * STEP;
    return value <= RECOMMENDATION_THRESHOLDS.shop ? "shop" : value >= RECOMMENDATION_THRESHOLDS.keep ? "keep" : "monitor";
  };
  const widths = { shop: 0, monitor: 0, keep: 0 };
  for (let i = 0; i < DOTS; i++) widths[zone(i)]++;

  return (
    <div role="img" aria-label={`Score ${signed(score, 2)}. Shop at ${RECOMMENDATION_THRESHOLDS.shop} or below, keep at ${RECOMMENDATION_THRESHOLDS.keep} or above.`} className="space-y-2.5">
      <div className="flex h-4 items-center justify-between">
        {Array.from({ length: DOTS }, (_, i) =>
          i === marker ? (
            <span key={i} className="size-3.5 shrink-0 rounded-full bg-signal ring-4 ring-signal/20" />
          ) : (
            <span key={i} className={cn("size-1.5 shrink-0 rounded-full", zone(i) === "shop" ? "bg-negative/50" : zone(i) === "keep" ? "bg-foreground/70" : DOT_OFF)} />
          ),
        )}
      </div>
      <div className="grid" style={{ gridTemplateColumns: `${widths.shop}fr ${widths.monitor}fr ${widths.keep}fr` }} aria-hidden>
        <MonoLabel>Shop</MonoLabel>
        <MonoLabel className="text-center">Monitor</MonoLabel>
        <MonoLabel className="text-right">Keep</MonoLabel>
      </div>
    </div>
  );
}
