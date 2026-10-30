export interface RidgeFit { names: string[]; mean: number[]; sd: number[]; coef: number[]; intercept: number; }

/** Standardized ridge regression; missing values (null) are imputed with the training mean. */
export function fitRidge(names: string[], rows: (number | null)[][], target: number[], lambda: number): RidgeFit {
  const k = names.length, n = rows.length;
  const mean = names.map((_, j) => { const v = rows.map(r => r[j]).filter((x): x is number => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; });
  const sd = names.map((_, j) => Math.sqrt(rows.reduce((a, r) => a + ((r[j] ?? mean[j]) - mean[j]) ** 2, 0) / n) || 1);
  const intercept = target.reduce((a, b) => a + b, 0) / n;
  const A = Array.from({ length: k }, () => new Array<number>(k + 1).fill(0));
  rows.forEach((row, r) => {
    const z = row.map((v, j) => ((v ?? mean[j]) - mean[j]) / sd[j]);
    for (let i = 0; i < k; i++) { for (let j = 0; j < k; j++) A[i][j] += z[i] * z[j]; A[i][k] += z[i] * (target[r] - intercept); }
  });
  for (let i = 0; i < k; i++) A[i][i] += lambda;
  for (let i = 0; i < k; i++) {
    let pivot = i;
    for (let r = i + 1; r < k; r++) if (Math.abs(A[r][i]) > Math.abs(A[pivot][i])) pivot = r;
    [A[i], A[pivot]] = [A[pivot], A[i]];
    for (let r = 0; r < k; r++) if (r !== i) { const f = A[r][i] / A[i][i]; for (let c = i; c <= k; c++) A[r][c] -= f * A[i][c]; }
  }
  const round = (x: number) => Math.round(x * 1e5) / 1e5;
  return { names, mean: mean.map(round), sd: sd.map(round), coef: A.map((row, i) => round(row[k] / row[i])), intercept: round(intercept) };
}

export function predictRidge(fit: RidgeFit, values: (number | null)[]) {
  return values.reduce<number>((sum, v, j) => sum + fit.coef[j] * ((v ?? fit.mean[j]) - fit.mean[j]) / fit.sd[j], fit.intercept);
}
