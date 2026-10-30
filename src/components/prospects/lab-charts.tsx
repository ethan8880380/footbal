import { DOT_OFF, DotMeter, DotStack } from "@/components/viz/dot-meter";
import { MonoLabel, Readout } from "@/components/viz/readout";
import { cn } from "@/lib/utils";

const SIDE = 12;
const fixed = (v: number | null, digits = 2) => (v === null ? "—" : v.toFixed(digits));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface DivergingProps { value: number | null; scale?: number; side?: number; tone?: "default" | "muted" | "signal"; size?: "sm" | "md" }

/** Zero-centred dot bar. Negative values fill leftward in the negative tone, so sign never depends on colour alone. */
export function Diverging({ value, scale = 1, side = SIDE, tone = "default", size = "md" }: DivergingProps) {
  const lit = value === null ? 0 : Math.round(clamp(Math.abs(value) / scale, 0, 1) * side);
  const negative = value !== null && value < 0;
  return (
    <span className="inline-flex items-center gap-[3px]">
      <DotMeter total={side} lit={negative ? lit : 0} reverse tone="negative" size={size} />
      <span aria-hidden className="mx-0.5 h-3 w-px bg-foreground/30" />
      <DotMeter total={side} lit={negative ? 0 : lit} tone={tone} size={size} />
    </span>
  );
}

export interface SkillRow { position: string; research: number | null; desk: number | null; pick: number | null }

/** Rank correlation with first-three-season PPR, one block per position. */
export function SkillBars({ rows }: { rows: SkillRow[] }) {
  const series = [["Research", "research", "signal"], ["Desk", "desk", "default"], ["Pick", "pick", "muted"]] as const;
  return (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
      {rows.map(row => (
        <div key={row.position} className="space-y-3" role="group" aria-label={`${row.position} rank correlation`}>
          <MonoLabel>{row.position}</MonoLabel>
          {series.map(([name, key, tone]) => (
            <div key={key} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3"><MonoLabel>{name}</MonoLabel><span className="num font-mono text-sm">{fixed(row[key], 3)}</span></div>
              <Diverging value={row[key]} tone={tone} side={12} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export interface ScatterDot { id: string; name: string; x: number; y: number }

const COLS = 32;
const ROWS = 18;
const PAD_LEFT = 44;
const PAD_BOTTOM = 22;
const PITCH = 14;
const WIDTH = PAD_LEFT + COLS * PITCH;
const HEIGHT = ROWS * PITCH + PAD_BOTTOM;

/** Dot-matrix density scatter on a square-root axis, so the heavy tail of NFL PPR stays legible. Dots on the diagonal are perfect predictions. */
export function DotScatter({ points, xLabel, yLabel }: { points: ScatterDot[]; xLabel: string; yLabel: string }) {
  const max = Math.max(1, ...points.flatMap(p => [p.x, p.y]));
  const unit = (v: number) => Math.sqrt(Math.max(0, v) / max);
  const cells = new Map<string, ScatterDot[]>();
  for (const p of points) {
    const col = Math.min(COLS - 1, Math.floor(unit(p.x) * COLS)), row = Math.min(ROWS - 1, Math.floor(unit(p.y) * ROWS));
    cells.set(`${col}:${row}`, [...(cells.get(`${col}:${row}`) ?? []), p]);
  }
  const crowded = Math.max(1, ...[...cells.values()].map(c => c.length));
  const tick = (t: number) => Math.round(max * t * t);
  const cx = (col: number) => PAD_LEFT + (col + .5) * PITCH, cy = (row: number) => (ROWS - row - .5) * PITCH;
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full text-foreground" role="img" aria-label={`${yLabel} versus ${xLabel}; ${points.length} players`}>
      {Array.from({ length: COLS * ROWS }, (_, i) => {
        const col = i % COLS, row = Math.floor(i / COLS), here = cells.get(`${col}:${row}`);
        const onDiagonal = Math.round(col * ROWS / COLS) === row;
        if (!here) return <circle key={i} cx={cx(col)} cy={cy(row)} r={onDiagonal ? 1.8 : 1.5} fill="currentColor" fillOpacity={onDiagonal ? .3 : .08} />;
        return <circle key={i} cx={cx(col)} cy={cy(row)} r={2.6 + 2 * Math.sqrt(here.length / crowded)} className="fill-signal"><title>{here.map(p => `${p.name} · predicted ${Math.round(p.x)} · actual ${Math.round(p.y)}`).join("\n")}</title></circle>;
      })}
      {[0, .5, 1].map(t => <text key={`y${t}`} x={PAD_LEFT - 10} y={cy(Math.min(ROWS - 1, Math.round(t * (ROWS - 1)))) + 3} textAnchor="end" className="fill-muted-foreground font-mono" fontSize="9">{tick(t)}</text>)}
      {[0, .5, 1].map(t => <text key={`x${t}`} x={cx(Math.min(COLS - 1, Math.round(t * (COLS - 1))))} y={HEIGHT - 6} textAnchor="middle" className="fill-muted-foreground font-mono" fontSize="9">{tick(t)}</text>)}
    </svg>
  );
}

export interface ClassRho { year: number; research: number | null; desk: number | null }

const UP = 10;
const DOWN = 3;

/** Per draft class correlation: rising columns are positive, hanging columns negative. */
export function ClassStrip({ classes }: { classes: ClassRho[] }) {
  const column = (value: number | null, fill: string) => (
    <div className="flex flex-col items-center gap-[3px]">
      <DotStack rows={UP} lit={value === null ? 0 : Math.round(clamp(value, 0, 1) * UP)} fill={fill} tip={fill} />
      <span aria-hidden className="h-px w-full bg-foreground/30" />
      <DotStack rows={DOWN} lit={value === null ? 0 : Math.round(clamp(-value, 0, 1) * UP)} fill="bg-negative" hanging />
    </div>
  );
  return (
    <div className="flex flex-wrap gap-6">
      {classes.map(c => (
        <div key={c.year} className="space-y-2" role="group" aria-label={`${c.year} class: Research ${fixed(c.research, 3)}, Desk ${fixed(c.desk, 3)}`}>
          <div className="flex gap-2">{column(c.research, "bg-signal")}{column(c.desk, "bg-foreground")}</div>
          <MonoLabel>{c.year}</MonoLabel>
          <div className="num font-mono text-[11px] leading-tight"><div>{fixed(c.research)}</div><div className="text-muted-foreground">{fixed(c.desk)}</div></div>
        </div>
      ))}
    </div>
  );
}

export interface PenaltyCandidate { lambda: number; validationLogMse: number }

/** Held-out error for each ridge penalty; taller is better and the chosen penalty lights in signal. */
export function PenaltyCurve({ candidates, chosen }: { candidates: PenaltyCandidate[]; chosen: number }) {
  const ordered = candidates.toSorted((a, b) => a.lambda - b.lambda);
  const best = Math.min(...ordered.map(c => c.validationLogMse)), worst = Math.max(...ordered.map(c => c.validationLogMse));
  const rows = 8;
  return (
    <div className="flex items-end gap-5">
      {ordered.map(c => {
        const isChosen = c.lambda === chosen;
        return (
          <div key={c.lambda} className="space-y-2" role="group" aria-label={`Penalty ${c.lambda}: held-out log MSE ${c.validationLogMse.toFixed(3)}${isChosen ? ", chosen" : ""}`}>
            <DotStack rows={rows} lit={worst > best ? rows - Math.round((c.validationLogMse - best) / (worst - best) * (rows - 2)) : rows} fill={isChosen ? "bg-signal" : "bg-foreground/35"} tip={isChosen ? "bg-signal" : "bg-foreground/35"} />
            <div className={cn("font-mono text-[11px]", isChosen ? "text-foreground" : "text-muted-foreground")}>{c.lambda}</div>
          </div>
        );
      })}
    </div>
  );
}

export interface WeightRow { label: string; weight: number }

/** Standardized ridge coefficients in log-PPR units, largest first. */
export function WeightBars({ weights }: { weights: WeightRow[] }) {
  const ordered = weights.toSorted((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  const scale = Math.max(.01, ...ordered.map(w => Math.abs(w.weight)));
  return (
    <ul className="space-y-3">
      {ordered.map(w => (
        <li key={w.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,12rem)_auto_4rem]">
          <span className="truncate text-xs">{w.label}</span>
          <Diverging value={w.weight} scale={scale} side={10} tone="signal" />
          <span className="num text-right font-mono text-xs">{w.weight >= 0 ? "+" : "−"}{Math.abs(w.weight).toFixed(3)}</span>
        </li>
      ))}
    </ul>
  );
}

export function ChartCard({ title, readout, unit, children, className }: { title: string; readout?: string; unit?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 space-y-5 rounded-3xl bg-card p-5 ring-1 ring-foreground/5", className)}>
      <div className="flex items-start justify-between gap-3"><MonoLabel>{title}</MonoLabel>{readout ? <Readout value={readout} unit={unit} /> : null}</div>
      {children}
    </section>
  );
}

const WIDE_DOT = "size-2 shrink-0 rounded-full";

/** Full-width dot row; lit dots in foreground with the leading dot in signal so the value reads as a position. */
export function SpreadMeter({ value, total = 25 }: { value: number | null; total?: number }) {
  const lit = value === null ? 0 : Math.round(clamp(value, 0, 100) / 100 * total);
  return (
    <span aria-hidden className="flex w-full justify-between">
      {Array.from({ length: total }, (_, i) => <span key={i} className={cn(WIDE_DOT, i >= lit ? DOT_OFF : i === lit - 1 ? "bg-signal" : "bg-foreground/70")} />)}
    </span>
  );
}

/** Full-width zero-centred dot row; direction is carried by side and the centre rule, magnitude by dot count. */
export function SpreadDiverging({ value, scale, side = 10 }: { value: number | null; scale: number; side?: number }) {
  const lit = value === null ? 0 : Math.round(clamp(Math.abs(value) / scale, 0, 1) * side), negative = value !== null && value < 0;
  const half = (on: number, tone: string, reverse: boolean) => (
    <span className={cn("flex flex-1 justify-between", reverse && "flex-row-reverse")}>
      {Array.from({ length: side }, (_, i) => <span key={i} className={cn(WIDE_DOT, i >= on ? DOT_OFF : i === on - 1 ? tone : "bg-foreground/70")} />)}
    </span>
  );
  return (
    <span aria-hidden className="flex w-full items-center gap-2">
      {half(negative ? lit : 0, "bg-negative", true)}
      <span className="h-4 w-px shrink-0 bg-foreground/40" />
      {half(negative ? 0 : lit, "bg-signal", false)}
    </span>
  );
}
