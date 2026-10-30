import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import Papa from "papaparse";
import { historicalFeatures, ORIGINAL_WEIGHTS, splitRows, selectWeights, metrics, prediction, bootstrapGain, type HistoricalRow, type Position } from "../src/lib/domain/prospect-backtest";

async function main() {
  const raw = await readFile("data/backtest/dataset.json", "utf8");
  const data = JSON.parse(raw) as { collectedAt: string; sources: unknown[]; cohortSize: number; rows: HistoricalRow[]; excluded: { draftYear: number; position: string; reason: string }[] };
  const rows = data.rows.map(historicalFeatures).filter(r => r !== null);
  if (new Set(rows.map(r => r.id)).size !== rows.length) throw new Error("Duplicate player in cohort");
  const positions = (["QB", "RB", "WR", "TE"] as Position[]).map(position => {
    const group = rows.filter(r => r.position === position);
    const { train, validation, test } = splitRows(group);
    const baseline = ORIGINAL_WEIGHTS[position];
    // Lock this choice without exposing the test rows to the optimizer.
    const candidate = selectWeights(train, validation, baseline);
    const measure = (sample: typeof rows) => ({ baseline: metrics(sample, r => prediction(r, baseline)), candidate: metrics(sample, r => prediction(r, candidate)), draftCapital: metrics(sample, r => -r.pick) });
    const trainResults = measure(train), validationResults = measure(validation), testResults = measure(test);
    const gain = (testResults.candidate.rho ?? -1) - (testResults.baseline.rho ?? -1);
    const interval = bootstrapGain(test, baseline, candidate);
    // Promotion is an explicit holdout gate, not additional parameter optimization.
    const promote = test.length >= 15 && gain > 0 && (testResults.candidate.ndcg5 ?? 0) >= (testResults.baseline.ndcg5 ?? 0) && candidate.some((w, i) => w !== baseline[i]);
    return { position, baseline, candidate, deployed: promote ? candidate : baseline, promoted: promote, coverage: { usable: group.length, excluded: data.excluded.filter(r => r.position === position).length }, train: trainResults, validation: validationResults, test: testResults, gain, gain95Interval: interval };
  });
  const report = { generatedAt: new Date().toISOString(), collectedAt: data.collectedAt, datasetSha256: createHash("sha256").update(raw).digest("hex"), sources: data.sources, target: "Total regular-season PPR fantasy points in first three NFL seasons; absent player-season = zero", cohort: "Drafted QB/RB/WR/TE, 2016–2022; no undrafted free agents", cohortSize: data.cohortSize, usable: rows.length, excluded: data.excluded.length, split: { train: [2016, 2017, 2018], validation: [2019, 2020], test: [2021, 2022] }, positions };
  await writeFile("docs/prospect-backtest-results.json", JSON.stringify(report, null, 2) + "\n");
  await writeFile("docs/prospect-backtest-predictions.csv", Papa.unparse(rows.toSorted((a, b) => a.year - b.year || a.pick - b.pick).map(row => {
    const config = positions.find(p => p.position === row.position)!;
    return { name: row.name, gsisId: row.id, draftYear: row.year, position: row.position, draftPick: row.pick, sample: row.year <= 2018 ? "train" : row.year <= 2020 ? "validation" : "test", ...Object.fromEntries(row.features.map((v, i) => [`feature${i + 1}`, v])), nflFirst3PPR: row.outcome, baseline: prediction(row, config.baseline), candidate: prediction(row, config.candidate), deployed: prediction(row, config.deployed) };
  })) + "\n");
  await writeFile("docs/prospect-backtest-exclusions.json", JSON.stringify(data.excluded, null, 2) + "\n");
  await writeFile("src/lib/domain/college-model-calibration.json", JSON.stringify({ version: positions.some(p => p.promoted) ? "Desk v1.1" : "Desk v1", weights: Object.fromEntries(positions.map(p => [p.position, p.deployed])), backtest: { usable: rows.length, total: data.cohortSize, train: "2016–2018", validation: "2019–2020", test: "2021–2022", outcome: "First-three-season NFL PPR", results: positions.map(p => ({ position: p.position, n: p.test.baseline.n, baselineRho: p.test.baseline.rho, candidateRho: p.test.candidate.rho, promoted: p.promoted, interval: p.gain95Interval })) } }, null, 2) + "\n");
  console.log(JSON.stringify({ usable: rows.length, total: data.cohortSize, results: positions.map(p => ({ position: p.position, weights: p.deployed, candidate: p.candidate, trainN: p.train.baseline.n, valN: p.validation.baseline.n, testN: p.test.baseline.n, old: p.test.baseline.rho, next: p.test.candidate.rho, oldNdcg: p.test.baseline.ndcg5, nextNdcg: p.test.candidate.ndcg5, interval: p.gain95Interval, promoted: p.promoted })) }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
