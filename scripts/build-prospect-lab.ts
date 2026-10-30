import { writeFile } from "node:fs/promises";
import { LAB_METRICS } from "../src/lib/domain/prospect-lab";
import { fitTuned, regressionPrediction } from "../src/lib/domain/prospect-regression";
import { metrics, type BacktestRow } from "../src/lib/domain/prospect-backtest";
import { loadLabRecords } from "./lab-data";

async function main() {
  const records = await loadLabRecords();
  const models = [], evaluations = [];
  for (const position of ["QB", "RB", "WR", "TE"] as const) for (const mode of ["college", "draft"] as const) {
    const group = records.filter(r => r.row.position === position);
    const train = group.filter(r => r.row.draftYear <= 2020), evaluation = group.filter(r => r.row.draftYear >= 2021);
    // Provider summaries have no archived pre-draft timestamps. Keep them out of the fitted model.
    // College composite also contains retrospectively tuned weights, so fit raw inputs instead.
    const keys = LAB_METRICS.filter(m => m.positions.includes(position) && !m.key.startsWith("advanced:") && m.key !== "college" && (mode === "draft" || m.key !== "capital")).map(m => m.key);
    const { model, radius, candidates, foldCount } = fitTuned(train, train.map(r => r.row.draftYear), keys);
    const lookup = new Map(evaluation.map(r => [r.row.id, r]));
    const backtest: BacktestRow[] = evaluation.map(r => ({ name: r.row.name, id: r.row.id, year: r.row.draftYear, position, pick: r.row.history!.draftPick, features: [0, 0, 0, 0], outcome: r.outcome }));
    const predicted = metrics(backtest, r => regressionPrediction(model, lookup.get(r.id)!.values).ppr);
    const baseline = metrics(backtest, r => mode === "draft" ? lookup.get(r.id)!.row.overall! : lookup.get(r.id)!.row.collegeScore!);
    const capital = metrics(backtest, r => lookup.get(r.id)!.values.capital!);
    const coverage = evaluation.filter(r => Math.abs(regressionPrediction(model, r.values).log - Math.log1p(Math.max(0, r.outcome))) <= radius).length / evaluation.length;
    models.push({ position, mode, ...model, radius, trainN: train.length, validationN: foldCount, evaluation: predicted, baseline, capital, intervalCoverage: coverage, candidates });
    evaluations.push(...evaluation.map(r => ({ id: r.row.id, name: r.row.name, year: r.row.draftYear, position, mode, actual: r.outcome, predicted: regressionPrediction(model, r.values).ppr })));
  }  const output = { version: "Research v3", source: "https://github.com/nflverse/nflverse-data/releases/download/combine/combine.csv", collectedAt: new Date().toISOString(), training: "2016–2020", validation: "leave-one-class-out", evaluation: "2021–2023 · reused development classes", models, evaluations };
  await writeFile("src/lib/domain/prospect-lab-calibration.json", JSON.stringify(output));
  await writeFile("docs/prospect-lab-backtest.json", JSON.stringify(output, null, 2));
  console.log(models.map(m => ({ position: m.position, mode: m.mode, inputs: m.features.length, lambda: m.lambda, rho: m.evaluation.rho, desk: m.baseline.rho, pick: m.capital.rho, coverage: m.intervalCoverage })));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
