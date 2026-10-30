import { DotStack } from "@/components/viz/dot-meter";
import { MonoLabel } from "@/components/viz/readout";

const ROWS = 6;

interface AgeCurveProps {
  age: number | null;
  curve: { prime: number; decline: number };
}

/** Rise, prime plateau, and decline as dot columns; the player's current age is the red tip. */
export function AgeCurve({ age, curve }: AgeCurveProps) {
  const start = curve.prime - 4;
  const end = curve.decline + 4;
  const ages = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  const current = age === null ? null : Math.min(end, Math.max(start, Math.floor(age)));

  return (
    <div role="img" aria-label={`Age ${age ?? "unknown"}; prime ${curve.prime} to ${curve.decline - 1}`} className="space-y-2">
      <div className="flex items-end justify-between">
        {ages.map((a) => {
          const isPrime = a >= curve.prime && a < curve.decline;
          const height = a < curve.prime ? 2 + Math.round((3 * (a - start)) / (curve.prime - start)) : isPrime ? ROWS : Math.max(1, ROWS - (a - curve.decline + 1));
          return (
            <DotStack
              key={a}
              rows={ROWS}
              lit={height}
              size="md"
              fill={isPrime ? "bg-foreground" : "bg-foreground/30"}
              tip={a === current ? "bg-signal" : undefined}
            />
          );
        })}
      </div>
      <div className="flex justify-between" aria-hidden>
        <MonoLabel>{start}</MonoLabel>
        <MonoLabel className="text-foreground">
          Prime {curve.prime}–{curve.decline - 1}
        </MonoLabel>
        <MonoLabel>{end}</MonoLabel>
      </div>
    </div>
  );
}
