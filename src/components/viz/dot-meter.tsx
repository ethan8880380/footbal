import { cn } from "@/lib/utils";

export const DOT_OFF = "bg-foreground/[0.08]";

const TONES = {
  default: "bg-foreground",
  muted: "bg-foreground/35",
  signal: "bg-signal",
  negative: "bg-negative",
} as const;

const SIZES = { sm: "size-1", md: "size-1 sm:size-1.5" } as const;

interface DotMeterProps {
  total: number;
  lit: number;
  tone?: keyof typeof TONES;
  size?: keyof typeof SIZES;
  /** Fill from the right edge, for the left half of a diverging meter. */
  reverse?: boolean;
  /** Last lit dots drawn in `tailTone`, e.g. the excess over a comparison. */
  tail?: number;
  tailTone?: keyof typeof TONES;
  className?: string;
}

export function DotMeter({ total, lit, tone = "default", size = "sm", reverse = false, tail = 0, tailTone = "signal", className }: DotMeterProps) {
  return (
    <span aria-hidden className={cn("inline-flex items-center gap-[3px]", reverse && "flex-row-reverse", className)}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn("shrink-0 rounded-full", SIZES[size], i >= lit ? DOT_OFF : i >= lit - tail ? TONES[tailTone] : TONES[tone])} />
      ))}
    </span>
  );
}

interface DotStackProps {
  rows: number;
  lit: number;
  fill?: string;
  /** Class for the outermost lit dot. */
  tip?: string;
  /** Hang from the top instead of rising from the bottom. */
  hanging?: boolean;
  size?: keyof typeof SIZES;
  className?: string;
}

export function DotStack({ rows, lit, fill = TONES.default, tip = fill, hanging = false, size = "md", className }: DotStackProps) {
  return (
    <span aria-hidden className={cn("flex gap-[3px]", hanging ? "flex-col" : "flex-col-reverse", className)}>
      {Array.from({ length: rows }, (_, row) => (
        <span key={row} className={cn("shrink-0 rounded-full", SIZES[size], row >= lit ? DOT_OFF : row === lit - 1 ? tip : fill)} />
      ))}
    </span>
  );
}
