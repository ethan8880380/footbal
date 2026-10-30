export const FINE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
/** Every step divides 100, so percentage scales top out at a clean 100%. */
export const PERCENT_STEPS = [1, 2, 2.5, 5, 10];

/** Smallest step × 10ⁿ that is at least `raw`, so every dot stands for a round amount. */
export function niceStep(raw: number, steps = FINE_STEPS) {
  if (!(raw > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  return steps.map((n) => n * magnitude).find((step) => step >= raw - 1e-9)!;
}

/** Any positive value lights at least one dot so small output never reads as zero. */
export function litDots(value: number | null, step: number, max: number) {
  if (value === null || value <= 0) return 0;
  return Math.min(max, Math.max(1, Math.round(value / step)));
}

/** Keeps the last item of each bucket, preserving the most recent reading per column. */
export function bucketLast<T>(items: T[], columns: number): T[] {
  if (items.length <= columns) return items;
  return Array.from({ length: columns }, (_, i) => items[Math.min(items.length - 1, Math.round(((i + 1) * items.length) / columns) - 1)]);
}
