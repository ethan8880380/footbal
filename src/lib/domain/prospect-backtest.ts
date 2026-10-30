import { evaluateCollegePlayer, type CollegePlayer } from "./college-model";
import type { Prospect } from "./prospects";

export type Position = Prospect["position"];
export type Weights = [number, number, number, number];
export const ORIGINAL_WEIGHTS: Record<Position, Weights> = { QB: [.45, .20, .20, .15], RB: [.30, .30, .20, .20], WR: [.35, .30, .20, .15], TE: [.35, .30, .20, .15] };
export interface HistoricalRow { name: string; gsisId: string; draftYear: number; position: Position; pick: number; college: CollegePlayer; outcome: number; }
export interface BacktestRow { name: string; id: string; year: number; position: Position; pick: number; features: Weights; outcome: number; }

/** Freeze the v1 feature transforms, sample shrinkage and season eligibility before tuning weights. */
export function historicalFeatures(row: HistoricalRow): BacktestRow | null {
  if (row.college.seasons.some(s => s.year >= row.draftYear)) throw new Error("Post-draft college season in backtest");
  const model = evaluateCollegePlayer(row.college, row.position, ORIGINAL_WEIGHTS[row.position], 0);
  if (!model.seasons.length) return null;
  const recency = model.seasons.length === 1 ? [1] : model.seasons.length === 2 ? [.65, .35] : [.55, .30, .15];
  const features = [0, 1, 2, 3].map(i => model.seasons.reduce((n, s, j) => n + recency[j] * (35 + ((s.components[i].score ?? 35) - 35) * Math.sqrt(s.reliability)), 0)) as Weights;
  return { name: row.name, id: row.gsisId, year: row.draftYear, position: row.position, pick: row.pick, features, outcome: row.outcome };
}
export function prediction(row: BacktestRow, weights: Weights) { return Math.round(row.features.reduce((s, v, i) => s + v * weights[i], 0) * 10) / 10; }
export function ranks(values: number[]) {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const result = new Array<number>(values.length);
  for (let i = 0; i < order.length;) {
    let end = i + 1;
    while (end < order.length && order[end].v === order[i].v) end++;
    for (let j = i; j < end; j++) result[order[j].i] = (i + end - 1) / 2 + 1;
    i = end;
  }
  return result;
}
export function spearman(a: number[], b: number[]) {
  if (a.length !== b.length || a.length < 3) return null;
  const x = ranks(a), y = ranks(b), mean = (a.length + 1) / 2;
  const numerator = x.reduce((s, v, i) => s + (v - mean) * (y[i] - mean), 0);
  const denominator = Math.sqrt(x.reduce((s, v) => s + (v - mean) ** 2, 0) * y.reduce((s, v) => s + (v - mean) ** 2, 0));
  return denominator ? numerator / denominator : null;
}
export function metrics(rows: BacktestRow[], score: (r: BacktestRow) => number) {
  const classes = [...new Set(rows.map(r => r.year))].sort().map(year => {
    const group = rows.filter(r => r.year === year);
    const ordered = group.toSorted((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
    const ideal = group.toSorted((a, b) => b.outcome - a.outcome);
    const dcg = (items: BacktestRow[]) => items.slice(0, 5).reduce((s, r, i) => s + Math.max(0, r.outcome) / Math.log2(i + 2), 0);
    return { year, n: group.length, rho: spearman(group.map(score), group.map(r => r.outcome)), ndcg5: dcg(ideal) ? dcg(ordered) / dcg(ideal) : null };
  });
  const valid = classes.filter(c => c.rho !== null);
  return { n: rows.length, rho: valid.length ? valid.reduce((s, c) => s + c.rho!, 0) / valid.length : null, ndcg5: classes.length ? classes.reduce((s, c) => s + (c.ndcg5 ?? 0), 0) / classes.length : null, classes };
}
export function weightGrid(): Weights[] {
  const grid: Weights[] = [];
  for (let a = 1; a <= 7; a++) for (let b = 1; b <= 7; b++) for (let c = 1; c <= 7; c++) {
    const d = 10 - a - b - c;
    if (d >= 1 && d <= 7) grid.push([a / 10, b / 10, c / 10, d / 10]);
  }
  return grid;
}
export function splitRows(rows: BacktestRow[]) {
  return { train: rows.filter(r => r.year >= 2016 && r.year <= 2018), validation: rows.filter(r => r.year >= 2019 && r.year <= 2020), test: rows.filter(r => r.year >= 2021 && r.year <= 2022) };
}
/** Holdout rows are deliberately not accepted by the selection function. */
export function selectWeights(train: BacktestRow[], validation: BacktestRow[], original: Weights) {
  if (train.length < 20 || validation.length < 15) return original;
  const distance = (w: Weights) => w.reduce((s, v, i) => s + (v - original[i]) ** 2, 0);
  const trainScore = (w: Weights) => (metrics(train, r => prediction(r, w)).rho ?? -1) - .10 * distance(w);
  const shortlist = weightGrid().toSorted((a, b) => trainScore(b) - trainScore(a)).slice(0, 5);
  const validationScore = (w: Weights) => (metrics(validation, r => prediction(r, w)).rho ?? -1) - .10 * distance(w);
  const candidate = [original, ...shortlist].toSorted((a, b) => validationScore(b) - validationScore(a))[0];
  return trainScore(candidate) > trainScore(original) && validationScore(candidate) > validationScore(original) + .01 ? candidate : original;
}

/** Paired, class-stratified player bootstrap; uncertainty is conditional on these two classes. */
export function bootstrapGain(rows: BacktestRow[], baseline: Weights, candidate: Weights, repetitions = 1000) {
  let seed = 20261029;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const groups = [...new Set(rows.map(r => r.year))].map(y => rows.filter(r => r.year === y));
  const gains: number[] = [];
  for (let i = 0; i < repetitions; i++) {
    const sample = groups.flatMap(group => group.map(() => group[Math.floor(random() * group.length)]));
    const old = metrics(sample, r => prediction(r, baseline)).rho;
    const next = metrics(sample, r => prediction(r, candidate)).rho;
    if (old !== null && next !== null) gains.push(next - old);
  }
  gains.sort((a, b) => a - b);
  return gains.length ? [gains[Math.floor(gains.length * .025)], gains[Math.min(gains.length - 1, Math.floor(gains.length * .975))]] : null;
}
