import { bucketLast } from "@/lib/dot-scale";
import { cn } from "@/lib/utils";

const ROWS = 5;
const PITCH = 4;

interface SparklineProps {
  values: (number | null)[];
  label: string;
  width?: number;
  height?: number;
  /** Anchor the bottom row at zero instead of the series minimum; use for shares. */
  fromZero?: boolean;
  className?: string;
}

/** Dot-matrix sparkline. Null columns stay dark, so byes and inactive weeks never read as zero. */
export function Sparkline({ values, label, width = 72, height = 22, fromZero = false, className }: SparklineProps) {
  const columns = bucketLast(values, Math.floor(width / PITCH));
  const numeric = columns.filter((v): v is number => v !== null);
  if (numeric.length < 2) {
    return <span className={cn("text-xs text-muted-foreground", className)}>—</span>;
  }
  const max = Math.max(...numeric);
  const min = fromZero ? 0 : Math.min(...numeric);
  const level = (v: number) => (max > min ? Math.round(((v - min) / (max - min)) * (ROWS - 1)) : Math.floor(ROWS / 2));
  const cw = width / columns.length;
  const ch = height / ROWS;
  const r = Math.min(cw, ch) * 0.32;
  const lastIndex = columns.findLastIndex((v) => v !== null);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      className={cn("shrink-0 text-foreground", className)}
      style={{
        backgroundImage: `radial-gradient(circle, color-mix(in oklch, currentColor 8%, transparent) ${r}px, transparent ${r + 0.5}px)`,
        backgroundSize: `${cw}px ${ch}px`,
      }}
    >
      {columns.map((v, i) => {
        if (v === null) return null;
        const top = level(v);
        return Array.from({ length: top + 1 }, (_, row) => (
          <circle
            key={`${i}-${row}`}
            cx={(i + 0.5) * cw}
            cy={height - (row + 0.5) * ch}
            r={r}
            className={row === top && i === lastIndex ? "fill-signal" : "fill-current"}
            fillOpacity={row === top ? 1 : 0.4}
          />
        ));
      })}
    </svg>
  );
}
