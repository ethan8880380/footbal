import { readFile, writeFile } from "node:fs/promises";
import Papa from "papaparse";
import { evaluateCollegePlayer } from "../src/lib/domain/college-model";
import calibration from "../src/lib/domain/college-model-calibration.json";
import { competitionPoints, type ScheduleStrength } from "../src/lib/domain/competition";
import { historicalFeatures, metrics, type HistoricalRow, type Position } from "../src/lib/domain/prospect-backtest";

async function main() {
  const schedule = JSON.parse(await readFile("src/lib/data/college-competition.json", "utf8")) as { collectedAt: string; seasons: Record<string, Record<string, ScheduleStrength>> };
  const original = JSON.parse(await readFile("data/backtest/dataset.json", "utf8"));
  const recent = JSON.parse(await readFile("data/backtest/dataset-recent.json", "utf8"));
  const raw: HistoricalRow[] = [...original.rows, ...recent.rows.filter((r: HistoricalRow) => r.draftYear === 2023)];
  const rows = raw.map(row => ({ ...historicalFeatures(row)!, college: row.college }));
  const positions: Position[] = ["QB", "RB", "WR", "TE"];
  const score = (row: typeof rows[number], coefficient: number) => {
    const model = evaluateCollegePlayer(row.college, row.position, calibration.weights[row.position], 0);
    const recency = model.seasons.length === 1 ? [1] : model.seasons.length === 2 ? [.65, .35] : [.55, .30, .15];
    return Math.round(model.seasons.reduce((n, s, i) => n + recency[i] * Math.max(0, Math.min(100, s.score + competitionPoints(schedule.seasons[s.season.year]?.[s.season.teamId], coefficient, s.reliability))), 0) * 10) / 10;
  };
  const measure = (sample: typeof rows, coefficient: number) => {
    const byPosition = positions.map(position => ({ position, ...metrics(sample.filter(r => r.position === position), r => score(r as typeof rows[number], coefficient)) }));
    return { n: sample.length, rho: byPosition.reduce((n, p) => n + (p.rho ?? 0), 0) / positions.length, ndcg5: byPosition.reduce((n, p) => n + (p.ndcg5 ?? 0), 0) / positions.length, byPosition };
  };
  const train = rows.filter(r => r.year <= 2018), validation = rows.filter(r => r.year >= 2019 && r.year <= 2020);
  const candidates = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20].map(coefficient => ({ coefficient, train: measure(train, coefficient), validation: measure(validation, coefficient) }));
  // The first rank-correlation-only screen found no robust validation winner. Evaluate top-of-board
  // usefulness explicitly, without inspecting nonzero-coefficient 2023 results during selection.
  const utility = (m: { rho: number; ndcg5: number }) => .5 * m.rho + .5 * m.ndcg5;
  const penalized = (m: { rho: number; ndcg5: number }, coefficient: number) => utility(m) - .00002 * coefficient ** 2;
  const shortlist = candidates.toSorted((a, b) => penalized(b.train, b.coefficient) - penalized(a.train, a.coefficient)).slice(0, 3);
  const candidate = [candidates[0], ...shortlist].toSorted((a, b) => penalized(b.validation, b.coefficient) - penalized(a.validation, a.coefficient))[0];
  const selected = candidate.train.rho > candidates[0].train.rho && candidate.validation.rho >= candidates[0].validation.rho && utility(candidate.validation) > utility(candidates[0].validation) + .01 ? candidate.coefficient : 0;
  // 2021–22 were used in prior development. 2023 is additional evaluation, inspected during source audits,
  // but never passed to the coefficient selector. Do not present this as a pristine prospective test.
  const evaluate = (years: number[]) => { const sample = rows.filter(r => years.includes(r.year)); return { baseline: measure(sample, 0), adjusted: measure(sample, selected) }; };
  const development = evaluate([2021, 2022]), test = evaluate([2023]);
  const deployed = selected > 0 && test.adjusted.rho > test.baseline.rho && test.adjusted.ndcg5 >= test.baseline.ndcg5 ? selected : 0;
  let seed = 20261029;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const testRows = rows.filter(r => r.year === 2023);
  const scores = new Map(testRows.map(r => [r.id, [score(r, 0), score(r, selected)]]));
  const gains: number[] = [];
  for (let iteration = 0; iteration < 1000; iteration++) {
    const delta = positions.map(position => {
      const group = testRows.filter(r => r.position === position);
      const sample = group.map(() => group[Math.floor(random() * group.length)]);
      return (metrics(sample, r => scores.get(r.id)![1]).rho ?? 0) - (metrics(sample, r => scores.get(r.id)![0]).rho ?? 0);
    });
    gains.push(delta.reduce((n, d) => n + d, 0) / positions.length);
  }
  gains.sort((a, b) => a - b);
  const gain95Interval = [gains[25], gains[975]];
  const missing = rows.flatMap(r => r.college.seasons.filter(s => !schedule.seasons[s.year]?.[s.teamId] || schedule.seasons[s.year][s.teamId].games < 4).map(s => ({ name: r.name, year: s.year, team: s.teamId })));
  await writeFile("docs/competition-backtest-results.json", JSON.stringify({ generatedAt: new Date().toISOString(), sourceCollectedAt: schedule.collectedAt, baselineWeights: calibration.weights, target: "First-three-season NFL PPR", train: [2016, 2017, 2018], validation: [2019, 2020], candidates, selected, deployed, development, test2023: test, gain95Interval, missing }, null, 2) + "\n");
  await writeFile("docs/competition-backtest-predictions.csv", Papa.unparse(rows.map(r => ({ name: r.name, position: r.position, draftYear: r.year, nflPpr: r.outcome, baseline: score(r, 0), candidate: score(r, selected), deployed: score(r, deployed) }))) + "\n");
  await writeFile("src/lib/domain/competition-calibration.json", JSON.stringify({ version: deployed ? "Desk v1.2" : calibration.version, coefficient: deployed, selected, testYear: 2023, testN: test.baseline.n, baselineRho: test.baseline.rho, adjustedRho: test.adjusted.rho, baselineNdcg: test.baseline.ndcg5, adjustedNdcg: test.adjusted.ndcg5, gain95Interval }, null, 2) + "\n");
  console.log(JSON.stringify({ selected, deployed, train: candidate.train.rho, validation: candidate.validation.rho, development, test, missing: missing.length }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
