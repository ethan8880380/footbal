import { readFile, writeFile } from "node:fs/promises";
import { collegePlayerSchema, evaluateCollegePlayer } from "../src/lib/domain/college-model";
import { prospectSchema } from "../src/lib/domain/prospects";
import { advancedKey, blendAdvanced, type AdvancedProspect } from "../src/lib/domain/advanced-prospects";
import { bakeryGradeSchema, BAKERY_CALIBRATION, indexBakeryGrades } from "../src/lib/domain/bakery-grades";
import { applyGradeFit, gradeFeatures, type GradePosition } from "../src/lib/domain/grade-model";
import { draftPickScore } from "../src/lib/domain/draft-capital";
import { metrics, spearman, type BacktestRow } from "../src/lib/domain/prospect-backtest";

/** Learns to reproduce Bakery grades from stats we own, validated by leaving whole draft classes out. */
const POSITIONS: GradePosition[] = ["QB", "RB", "WR", "TE"];
const LAMBDAS = [1, 3, 10, 30, 100, 300];
type Sample = { year: number; names: string[]; x: (number | null)[]; grade: number; overall: number; old: number | null; name: string; pick: number | null };

function fit(train: Sample[], lambda: number) {
  const names = train[0].names, k = names.length;
  const mean = names.map((_, j) => { const v = train.map(r => r.x[j]).filter((n): n is number => n !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; });
  const sd = names.map((_, j) => { const v = train.map(r => r.x[j] ?? mean[j]); return Math.sqrt(v.reduce((a, b) => a + (b - mean[j]) ** 2, 0) / v.length) || 1; });
  const intercept = train.reduce((a, r) => a + r.grade, 0) / train.length;
  const A = Array.from({ length: k }, () => new Array<number>(k + 1).fill(0));
  for (const r of train) {
    const z = r.x.map((v, j) => ((v ?? mean[j]) - mean[j]) / sd[j]);
    for (let i = 0; i < k; i++) { for (let j = 0; j < k; j++) A[i][j] += z[i] * z[j]; A[i][k] += z[i] * (r.grade - intercept); }
  }
  for (let i = 0; i < k; i++) A[i][i] += lambda;
  for (let i = 0; i < k; i++) {
    let p = i; for (let r = i + 1; r < k; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    for (let r = 0; r < k; r++) if (r !== i) { const f = A[r][i] / A[i][i]; for (let c = i; c <= k; c++) A[r][c] -= f * A[i][c]; }
  }
  const coef = A.map((row, i) => row[k] / row[i]);
  const pairs = train.map(r => [r.grade, r.overall] as [number, number]).sort((a, b) => a[0] - b[0]);
  // Monotone knots: bin means over 12 quantile bins, then enforce non-decreasing Overall.
  const bins = 12, knots: [number, number][] = [];
  for (let b = 0; b < bins; b++) {
    const slice = pairs.slice(Math.floor(b * pairs.length / bins), Math.floor((b + 1) * pairs.length / bins));
    if (slice.length) knots.push([slice.reduce((a, p) => a + p[0], 0) / slice.length, slice.reduce((a, p) => a + p[1], 0) / slice.length]);
  }
  for (let i = 1; i < knots.length; i++) knots[i][1] = Math.max(knots[i][1], knots[i - 1][1]);
  const round = (n: number) => Math.round(n * 1e5) / 1e5;
  return { names, mean: mean.map(round), sd: sd.map(round), coef: coef.map(round), intercept: round(intercept), knots: knots.map(([a, b]) => [round(a), round(b)] as [number, number]) };
}
const predict = (f: ReturnType<typeof fit>, r: Sample) => applyGradeFit(f, { names: r.names, values: r.x });
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

async function main() {
  const grades = indexBakeryGrades(bakeryGradeSchema.array().parse(JSON.parse(await readFile("src/lib/data/bakery-grades.json", "utf8"))));
  const advanced: AdvancedProspect[] = JSON.parse(await readFile("data/bakery-advanced/records.json", "utf8"));
  const advancedIndex = new Map(advanced.map(r => [advancedKey(r.name, r.position, r.draftYear), r]));
  const history = JSON.parse(await readFile("src/lib/data/historical-prospects.json", "utf8")).entries as { prospect: unknown; college: unknown; history: { draftPick: number } }[];
  const outcomes = new Map<string, number>();
  for (const f of ["dataset.json", "dataset-recent.json"]) for (const r of JSON.parse(await readFile(`data/backtest/${f}`, "utf8")).rows) if (r.draftYear <= 2023) outcomes.set(advancedKey(r.name, r.position, r.draftYear), r.outcome);
  const fits: Record<string, ReturnType<typeof fit>> = {}, weights: Record<string, number> = {}, report = [];
  for (const position of POSITIONS) {
    const samples: Sample[] = history.flatMap(e => {
      const p = prospectSchema.parse(e.prospect);
      if (p.position !== position) return [];
      const key = advancedKey(p.name, p.position, p.draftYear), g = grades.get(key);
      if (!g) return [];
      const model = evaluateCollegePlayer(collegePlayerSchema.parse(e.college), position);
      const features = gradeFeatures({ position, model, advanced: advancedIndex.get(key) ?? null, draftAge: g.draftAge });
      return [{ year: p.draftYear, names: features.names, x: features.values, grade: g.grade, overall: g.overall, old: model.score, name: p.name, pick: e.history?.draftPick ?? null }];
    });
    const years = [...new Set(samples.map(s => s.year))].sort();
    const tried = LAMBDAS.map(lambda => {
      const held: { s: Sample; grade: number; overall: number }[] = [];
      for (const year of years) {
        const train = samples.filter(s => s.year !== year), f = fit(train, lambda);
        for (const s of samples.filter(r => r.year === year)) { const out = predict(f, s); if (out) held.push({ s, ...out }); }
      }
      const perClass = years.map(year => held.filter(h => h.s.year === year)).filter(g => g.length > 5).map(g => spearman(g.map(h => h.grade), g.map(h => h.s.grade))!);
      const sse = held.reduce((a, h) => a + (h.grade - h.s.grade) ** 2, 0), m = mean(held.map(h => h.s.grade)), sst = held.reduce((a, h) => a + (h.s.grade - m) ** 2, 0);
      return { lambda, held, rho: mean(perClass), r2: 1 - sse / sst };
    });
    const best = tried.toSorted((a, b) => b.rho - a.rho)[0];
    const oldRho = mean(years.map(y => samples.filter(s => s.year === y && s.old !== null)).filter(g => g.length > 5).map(g => spearman(g.map(s => s.old!), g.map(s => s.grade))!));
    // Does the predicted grade, blended with draft pick, still rank NFL outcomes? Compare with the published grade.
    const rowsFor = (score: (h: (typeof best.held)[number]) => number, weight: number = BAKERY_CALIBRATION.weights[position]) => best.held.flatMap(h => {
      const outcome = outcomes.get(advancedKey(h.s.name, position, h.s.year)), capital = h.s.pick === null ? null : draftPickScore(h.s.pick);
      return outcome === undefined || capital === null ? [] : [{ name: h.s.name, id: h.s.name + h.s.year, year: h.s.year, position, pick: h.s.pick!, features: [0, 0, 0, 0], outcome, value: score(h) * (1 - weight) + capital * weight } as BacktestRow & { value: number }];
    });
    const legacyOf = (h: (typeof best.held)[number]) => { const adv = advancedIndex.get(advancedKey(h.s.name, position, h.s.year)); return blendAdvanced(h.s.old, adv).score ?? h.overall; };
    const mixRows = rowsFor(h => (h.overall + legacyOf(h)) / 2), legacyRows = rowsFor(legacyOf);
    // Predicted grades are noisier than published ones, so draft capital gets its own weight (floor .3, as for published grades).
    const utility = (m: ReturnType<typeof metrics>) => ((m.rho ?? 0) + (m.ndcg5 ?? 0)) / 2;
    const weightGrid = [.3, .4, .5, .6, .7].map(w => ({ w, m: metrics(rowsFor(h => h.overall, w), r => (r as BacktestRow & { value: number }).value) }));
    const chosen = weightGrid.toSorted((a, b) => utility(b.m) - utility(a.m))[0];
    weights[position] = chosen.w;
    const predictedRows = rowsFor(h => h.overall, chosen.w), publishedRows = rowsFor(h => h.s.overall);
    const nfl = (rows: (BacktestRow & { value: number })[]) => metrics(rows, r => (r as BacktestRow & { value: number }).value);
    fits[position] = fit(samples, best.lambda);
    report.push({ position, n: samples.length, lambda: best.lambda, gradeRhoHeldOut: best.rho, gradeRhoOldScore: oldRho, gradeR2: best.r2, nflN: predictedRows.length, draftWeight: chosen.w, nflRhoPredicted: nfl(predictedRows).rho, nflRhoPublished: nfl(publishedRows).rho, nflNdcgPredicted: nfl(predictedRows).ndcg5, nflNdcgPublished: nfl(publishedRows).ndcg5, nflRhoLegacy: nfl(legacyRows).rho, nflRhoMix: nfl(mixRows).rho, nflNdcgLegacy: nfl(legacyRows).ndcg5, nflNdcgMix: nfl(mixRows).ndcg5 });
  }
  await writeFile("src/lib/domain/grade-model-calibration.json", JSON.stringify({ version: "Desk v2", weights, fits, results: report }, null, 1) + "\n");
  console.table(report.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "number" && k !== "n" && k !== "lambda" && k !== "nflN" ? +v.toFixed(3) : v]))));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
