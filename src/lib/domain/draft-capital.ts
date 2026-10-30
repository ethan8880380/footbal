import calibration from "./draft-capital-calibration.json";
export const DRAFT_CALIBRATION = calibration;
export type DraftSignal = { kind: "Actual pick" | "Projection"; label: string; score: number; weight: number };
const anchors = [[1, 100], [10, 95], [32, 85], [64, 72], [100, 55], [150, 35], [200, 20], [260, 8], [300, 0]];
export function draftPickScore(pick: number) {
  if (!Number.isInteger(pick) || pick < 1 || pick > 300) return null;
  const upper = anchors.findIndex(([p]) => p >= pick);
  if (upper === 0) return 100;
  const [lo, a] = anchors[upper - 1], [hi, b] = anchors[upper];
  return a + (b - a) * (pick - lo) / (hi - lo);
}
export function projectionScore(label: string) {
  const text = label.toLowerCase().replace(/\s+/g, "");
  if (text === "udfa" || text === "undrafted") return 0;
  const top = /^top(5|10|20|32)$/.exec(text);
  const round = /^(?:round|rd)([1-7])$/.exec(text) ?? /^([1-7])(?:st|nd|rd|th)?round$/.exec(text);
  const ranges = [[1, 32], [33, 64], [65, 100], [101, 140], [141, 180], [181, 220], [221, 260]];
  const range = top ? [1, Number(top[1])] : round ? ranges[Number(round[1]) - 1] : null;
  if (!range) return null;
  // Average the range, rather than presenting an invented exact projected pick.
  let sum = 0;
  for (let pick = range[0]; pick <= range[1]; pick++) sum += draftPickScore(pick)!;
  return sum / (range[1] - range[0] + 1);
}
export function draftSignal(position: "QB" | "RB" | "WR" | "TE", actualPick: number | undefined, projection: string): DraftSignal | null {
  const actual = actualPick === undefined ? null : draftPickScore(actualPick);
  if (actual !== null) return { kind: "Actual pick", label: `#${actualPick}`, score: actual, weight: calibration.weights[position] };
  const projected = projectionScore(projection);
  return projected === null ? null : { kind: "Projection", label: projection, score: projected, weight: calibration.weights[position] * .5 };
}
export function blendDraftCapital(base: number | null, signal: DraftSignal | null) {
  return base === null ? null : signal ? Math.round((base * (1 - signal.weight) + signal.score * signal.weight) * 10) / 10 : base;
}
