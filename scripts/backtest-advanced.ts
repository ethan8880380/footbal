import { readFile, writeFile } from "node:fs/promises";
import { advancedKey, advancedScore, blendAdvanced, type AdvancedProspect } from "../src/lib/domain/advanced-prospects";
import { evaluateCollegePlayer } from "../src/lib/domain/college-model";
import { historicalFeatures, metrics, type HistoricalRow, type BacktestRow } from "../src/lib/domain/prospect-backtest";

async function main() {
  const records: AdvancedProspect[] = JSON.parse(await readFile("data/bakery-advanced/records.json", "utf8"));
  const byKey = new Map(records.map(r => [advancedKey(r.name, r.position, r.draftYear), r]));
  const datasets = await Promise.all(["dataset.json", "dataset-recent.json"].map(async file => JSON.parse(await readFile(`data/backtest/${file}`, "utf8"))));
  const raw: HistoricalRow[] = datasets.flatMap(d => d.rows).filter((r: HistoricalRow) => r.draftYear <= 2023);
  const rows = raw.flatMap(r => {
    const features = historicalFeatures(r);
    if (!features) return [];
    const advanced = byKey.get(advancedKey(r.name, r.position, r.draftYear));
    return [{ ...features, advanced, base: evaluateCollegePlayer(r.college, r.position).score! }];
  });
  const byId = new Map(rows.map(r => [r.id, r]));
  const score = (r: BacktestRow, weight: number) => { const row = byId.get(r.id)!; return blendAdvanced(row.base, row.advanced, weight).score!; };
  const results = (["QB", "RB", "WR", "TE"] as const).map(position => {
    const group = rows.filter(r => r.position === position);
    const train = group.filter(r => r.year <= 2018), validation = group.filter(r => r.year >= 2019 && r.year <= 2020), evaluation = group.filter(r => r.year >= 2021);
    const utility = (m: ReturnType<typeof metrics>) => .5 * (m.rho ?? 0) + .5 * (m.ndcg5 ?? 0);
    const candidates = [0, .15, .30, .45].map(weight => ({ weight, train: metrics(train, r => score(r, weight)), validation: metrics(validation, r => score(r, weight)) }));
    const eligible = candidates.filter(c => c.weight === 0 || utility(c.train) > utility(candidates[0].train) && utility(c.validation) > utility(candidates[0].validation) + .01);
    const selected = eligible.toSorted((a, b) => (utility(b.validation) - .02 * b.weight ** 2) - (utility(a.validation) - .02 * a.weight ** 2))[0].weight;
    // Prior evaluation classes are reused for reporting, never for selecting the blend.
    return { position, weight: selected, coverage: group.filter(r => advancedScore(r.advanced)).length, total: group.length, candidates,
      baseline: metrics(evaluation, r => score(r, 0)), adjusted: metrics(evaluation, r => score(r, selected)),
      evaluationCovered: evaluation.filter(r => advancedScore(r.advanced)).length };
  });
  await writeFile("docs/advanced-backtest-results.json", JSON.stringify({ generatedAt: new Date().toISOString(), target: "First three NFL seasons, PPR total", training: "2016–2018", validation: "2019–2020", evaluation: "2021–2023; reused development classes, retrospective source snapshots", results }, null, 2) + "\n");
  await writeFile("src/lib/domain/advanced-calibration.json", JSON.stringify({ version: "Desk v1.3", weights: Object.fromEntries(results.map(r => [r.position, r.weight])), results: results.map(({ position, weight, coverage, total, baseline, adjusted, evaluationCovered }) => ({ position, weight, coverage, total, baseline, adjusted, evaluationCovered })) }, null, 2) + "\n");
  console.log(JSON.stringify(results.map(({ position, weight, coverage, total, baseline, adjusted }) => ({ position, weight, coverage, total, baselineRho: baseline.rho, adjustedRho: adjusted.rho, baselineNdcg: baseline.ndcg5, adjustedNdcg: adjusted.ndcg5 })), null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
