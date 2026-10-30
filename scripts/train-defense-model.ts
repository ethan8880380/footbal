import { readFile, writeFile } from "node:fs/promises";
import { draftPickScore } from "../src/lib/domain/draft-capital";
import { metrics, spearman, type BacktestRow } from "../src/lib/domain/prospect-backtest";
import { defenseFeatures, DEFENSE_POSITIONS, type DefensePosition, type DefensiveSeason } from "../src/lib/domain/defense-model";
import { fitRidge, predictRidge } from "../src/lib/domain/ridge";


/** Learns a college-only scouting score for defenders, then picks how much draft capital to blend, leaving whole classes out. */
interface Row { name: string; draftYear: number; group: DefensePosition; pick: number; outcome: number | null; height: number | null; weight: number | null; college: DefensiveSeason[] }
const LAMBDAS = [30, 100, 300, 1000], BLENDS = [0, .3, .5, .6, .7, .8, .9, 1], MIN_CAPITAL = .5, MIN_SCOUT_RHO = .1;
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const names = defenseFeatures({ seasons: [], height: null, weight: null }).names;
const featuresOf = (r: Row) => defenseFeatures({ seasons: r.college, height: r.height, weight: r.weight }).values;
const QUANTILES = 101;
function quantiles(values: number[]) { const s = values.toSorted((a, b) => a - b); return Array.from({ length: QUANTILES }, (_, i) => Math.round(s[Math.round(i * (s.length - 1) / (QUANTILES - 1))] * 1e5) / 1e5); }
function percentile(q: number[], raw: number) { let i = 0; while (i < q.length - 1 && raw > q[i + 1]) i++; const span = q[Math.min(i + 1, q.length - 1)] - q[i]; return raw <= q[0] ? 0 : raw >= q.at(-1)! ? 100 : i + (span > 0 ? (raw - q[i]) / span : 0); }

async function main() {
  const data = JSON.parse(await readFile("data/backtest/defense-dataset.json", "utf8")) as { rows: Row[] };
  const fits: Record<string, unknown> = {}, weights: Record<string, number> = {}, usable: Record<string, boolean> = {}, results: unknown[] = [];
  for (const group of DEFENSE_POSITIONS) {
    const rows = data.rows.filter(r => r.group === group && r.outcome !== null && draftPickScore(r.pick) !== null);
    const years = [...new Set(rows.map(r => r.draftYear))].sort();
    const fold = (lambda: number) => years.flatMap(year => {
      const train = rows.filter(r => r.draftYear !== year), fit = fitRidge(names, train.map(featuresOf), train.map(r => r.outcome!), lambda);
      const q = quantiles(train.map(r => predictRidge(fit, featuresOf(r))));
      return rows.filter(r => r.draftYear === year).map(r => ({ r, scout: percentile(q, predictRidge(fit, featuresOf(r))) }));
    });
    const tried = LAMBDAS.map(lambda => { const held = fold(lambda); const perClass = years.map(y => held.filter(h => h.r.draftYear === y)).filter(g => g.length > 8).map(g => spearman(g.map(h => h.scout), g.map(h => h.r.outcome!))!); return { lambda, held, rho: mean(perClass) }; });
    const best = tried.toSorted((a, b) => b.rho - a.rho)[0];
    const asRows = (value: (h: (typeof best.held)[number]) => number) => best.held.map(h => ({ name: h.r.name, id: h.r.name + h.r.draftYear, year: h.r.draftYear, position: group, pick: h.r.pick, features: [0, 0, 0, 0], outcome: h.r.outcome!, value: value(h) }) as unknown as BacktestRow & { value: number });
    const score = (rows: (BacktestRow & { value: number })[]) => metrics(rows, r => (r as BacktestRow & { value: number }).value);
    const blends = BLENDS.map(w => ({ w, m: score(asRows(h => h.scout * (1 - w) + draftPickScore(h.r.pick)! * w)) }));
    const utility = (m: ReturnType<typeof metrics>) => ((m.rho ?? 0) + (m.ndcg5 ?? 0)) / 2;
    const chosen = blends.filter(b => b.w >= MIN_CAPITAL).toSorted((a, b) => utility(b.m) - utility(a.m))[0];
    const full = fitRidge(names, rows.map(featuresOf), rows.map(r => r.outcome!), best.lambda);
    fits[group] = { ...full, quantiles: quantiles(rows.map(r => predictRidge(full, featuresOf(r)))) };
    weights[group] = chosen.w;
    usable[group] = best.rho >= MIN_SCOUT_RHO;
    results.push({ position: group, n: rows.length, lambda: best.lambda, scoutRho: best.rho, draftWeight: chosen.w, blendRho: chosen.m.rho, blendNdcg5: chosen.m.ndcg5, pickRho: blends.at(-1)!.m.rho, pickNdcg5: blends.at(-1)!.m.ndcg5, draftOnlyBlendRho: blends.find(b => b.w === 0)!.m.rho });
  }
  await writeFile("src/lib/domain/defense-model-calibration.json", JSON.stringify({ version: "Desk v2", featureNames: names, weights, usable, fits, results }, null, 1) + "\n");
  console.table((results as Record<string, number | string>[]).map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "number" && !["n", "lambda"].includes(k) ? +v.toFixed(3) : v]))));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
