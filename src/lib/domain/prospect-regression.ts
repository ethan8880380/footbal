import type { Measurements } from "./prospect-lab";

export interface Regression { intercept: number; lambda: number; features: { key: string; mean: number; sd: number; weight: number; coverage: number }[]; }
export interface Observation { values: Measurements; outcome: number }
const clamp = (v: number) => Math.max(-3, Math.min(3, v));
export function fitRegression(rows: Observation[], keys: string[], lambda: number, penalties: Record<string, number> = {}): Regression {
  if (!rows.length || lambda <= 0) throw new Error("Training data and positive regularization required");
  const features = keys.flatMap(key => {
    const values = rows.flatMap(r => r.values[key] == null ? [] : [r.values[key]!]);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
    return values.length >= Math.max(10, rows.length * .5) && sd > 1e-8 ? [{ key, mean, sd, weight: 0, coverage: values.length / rows.length }] : [];
  });
  const x = rows.map(r => [1, ...features.map(f => r.values[f.key] == null ? 0 : clamp((r.values[f.key]! - f.mean) / f.sd))]);
  const y = rows.map(r => Math.log1p(Math.max(0, r.outcome)));
  const n = features.length + 1;
  // Solve ridge normal equations with partial-pivot Gaussian elimination. Intercept is unpenalized.
  const a = Array.from({ length: n }, (_, i) => [...Array.from({ length: n }, (_, j) => x.reduce((sum, row) => sum + row[i] * row[j], 0) + (i === j && i > 0 ? lambda * (penalties[features[i - 1].key] ?? 1) : 0)), x.reduce((sum, row, k) => sum + row[i] * y[k], 0)]);
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let j = i + 1; j < n; j++) if (Math.abs(a[j][i]) > Math.abs(a[pivot][i])) pivot = j;
    [a[i], a[pivot]] = [a[pivot], a[i]];
    const divisor = a[i][i];
    if (Math.abs(divisor) < 1e-12) throw new Error("Singular regression");
    for (let j = i; j <= n; j++) a[i][j] /= divisor;
    for (let k = 0; k < n; k++) if (k !== i) { const factor = a[k][i]; for (let j = i; j <= n; j++) a[k][j] -= factor * a[i][j]; }
  }
  return { intercept: a[0][n], lambda, features: features.map((f, i) => ({ ...f, weight: a[i + 1][n] })) };
}
export function regressionPrediction(model: Regression, values: Measurements) {
  const contributions = model.features.map(f => ({ key: f.key, missing: values[f.key] == null, value: values[f.key] ?? null, contribution: values[f.key] == null ? 0 : f.weight * clamp((values[f.key]! - f.mean) / f.sd) }));
  const log = model.intercept + contributions.reduce((sum, f) => sum + f.contribution, 0);
  return { ppr: Math.max(0, Math.expm1(log)), log, contributions, coverage: contributions.filter(c => !c.missing).length / Math.max(1, contributions.length) };
}

export const RIDGE_PENALTIES = [1, 5, 20, 80, 320];
/** Draft capital is the strongest pre-selected signal; shrinking it like noisy inputs discards most of the model's skill. */
export const CAPITAL_PENALTY = .05;
export const MAX_INPUTS = 8;
const logOutcome = (r: Observation) => Math.log1p(Math.max(0, r.outcome));

/** Keep the strongest-correlated inputs (training rows only). Capital is always retained when offered. */
export function selectInputs(rows: Observation[], keys: string[], limit = MAX_INPUTS) {
  const y = rows.map(logOutcome), my = y.reduce((s, v) => s + v, 0) / y.length;
  const ranked = keys.flatMap(key => {
    const pairs = rows.flatMap((r, i) => r.values[key] == null ? [] : [[r.values[key]!, y[i]] as const]);
    if (pairs.length < Math.max(10, rows.length * .5)) return [];
    const mx = pairs.reduce((s, p) => s + p[0], 0) / pairs.length;
    const sxy = pairs.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0), sxx = pairs.reduce((s, p) => s + (p[0] - mx) ** 2, 0), syy = pairs.reduce((s, p) => s + (p[1] - my) ** 2, 0);
    return sxx > 1e-12 && syy > 1e-12 ? [{ key, strength: Math.abs(sxy / Math.sqrt(sxx * syy)) }] : [];
  }).sort((a, b) => b.strength - a.strength || a.key.localeCompare(b.key)).map(r => r.key);
  const chosen = ranked.filter(k => k !== "capital").slice(0, keys.includes("capital") ? limit - 1 : limit);
  return keys.includes("capital") && ranked.includes("capital") ? ["capital", ...chosen] : chosen;
}

/**
 * Leave-one-draft-class-out tuning. Input selection happens inside each fold, so the penalty
 * is chosen on genuinely unseen classes. The final model refits on every supplied row.
 */
export function fitTuned(rows: Observation[], years: number[], keys: string[]) {
  const penalties = { capital: CAPITAL_PENALTY };
  const folds = [...new Set(years)].sort().map(year => ({ fit: rows.filter((_, i) => years[i] !== year), hold: rows.filter((_, i) => years[i] === year) })).filter(f => f.fit.length >= 20 && f.hold.length);
  if (!folds.length) throw new Error("At least two draft classes required");
  const scored = RIDGE_PENALTIES.map(lambda => {
    const residuals = folds.flatMap(({ fit, hold }) => { const model = fitRegression(fit, selectInputs(fit, keys), lambda, penalties); return hold.map(r => Math.abs(regressionPrediction(model, r.values).log - logOutcome(r))); });
    return { lambda, validationLogMse: residuals.reduce((s, e) => s + e * e, 0) / residuals.length, residuals };
  }).sort((a, b) => a.validationLogMse - b.validationLogMse);
  const best = scored[0], sorted = best.residuals.toSorted((a, b) => a - b);
  return { model: fitRegression(rows, selectInputs(rows, keys), best.lambda, penalties), radius: sorted[Math.min(sorted.length - 1, Math.ceil((sorted.length + 1) * .8) - 1)], candidates: scored.map(({ lambda, validationLogMse }) => ({ lambda, validationLogMse })), foldCount: folds.length };
}
