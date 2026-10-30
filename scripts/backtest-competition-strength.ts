import { readFile, writeFile } from "node:fs/promises";
import { evaluateCollegePlayer } from "../src/lib/domain/college-model";
import { historicalFeatures, metrics, type HistoricalRow, type BacktestRow } from "../src/lib/domain/prospect-backtest";
import { advancedKey, blendAdvanced, type AdvancedProspect } from "../src/lib/domain/advanced-prospects";

async function main() {
  const raw: HistoricalRow[] = (await Promise.all(["dataset.json", "dataset-recent.json"].map(async f => JSON.parse(await readFile(`data/backtest/${f}`, "utf8")).rows))).flat().filter(r => r.draftYear <= 2023);
  const advanced: AdvancedProspect[] = JSON.parse(await readFile("data/bakery-advanced/records.json", "utf8"));
  const lookup = new Map(advanced.map(r => [advancedKey(r.name, r.position, r.draftYear), r]));
  const rows = raw.flatMap(r => { const features = historicalFeatures(r); return features ? [{ ...features, model: evaluateCollegePlayer(r.college, r.position), advanced: lookup.get(advancedKey(r.name, r.position, r.draftYear)) }] : []; });
  const schedules = new Map(rows.filter(r => r.year <= 2018).flatMap(r => r.model.seasons.filter(s => s.scheduleStrength).map(s => [`${s.season.year}:${s.season.teamId}`, s.scheduleStrength!.opponents] as const)));
  // Reference is fixed from unique team-seasons in training, without looking at NFL outcomes.
  const reference = Math.round([...schedules.values()].reduce((n, v) => n + v, 0) / schedules.size * 10) / 10;
  const configs = [{ coefficient: 16, reference: 0, cap: 15 }, ...[24, 32, 40, 48].map(coefficient => ({ coefficient, reference, cap: 25 }))];
  const byId = new Map(rows.map(r => [r.id, r]));
  const predict = (r: BacktestRow, config: typeof configs[number]) => {
    const row = byId.get(r.id)!;
    const weights = row.model.seasons.length === 1 ? [1] : row.model.seasons.length === 2 ? [.65, .35] : [.55, .30, .15];
    const base = Math.round(row.model.seasons.reduce((n, s, i) => {
      const adjustment = s.scheduleStrength ? Math.max(-config.cap, Math.min(config.cap, config.coefficient * (s.scheduleStrength.opponents - config.reference) / 10)) * Math.sqrt(s.reliability) : 0;
      return n + weights[i] * Math.max(0, Math.min(100, s.productionScore + adjustment));
    }, 0) * 10) / 10;
    return blendAdvanced(base, row.advanced).score!;
  };
  const measure = (sample: typeof rows, config: typeof configs[number]) => {
    const positions = (["QB", "RB", "WR", "TE"] as const).map(position => ({ position, ...metrics(sample.filter(r => r.position === position), r => predict(r, config)) }));
    return { n: sample.length, rho: positions.reduce((n, p) => n + (p.rho ?? 0), 0) / 4, ndcg5: positions.reduce((n, p) => n + (p.ndcg5 ?? 0), 0) / 4, positions };
  };
  const candidates = configs.map(config => ({ ...config, train: measure(rows.filter(r => r.year <= 2018), config), validation: measure(rows.filter(r => r.year >= 2019 && r.year <= 2020), config) }));
  const utility = (m: { rho: number; ndcg5: number }) => (m.rho + m.ndcg5) / 2;
  const eligible = candidates.filter((c, i) => i === 0 || c.train.rho >= candidates[0].train.rho && c.validation.rho >= candidates[0].validation.rho && c.validation.ndcg5 >= candidates[0].validation.ndcg5);
  const selected = eligible.toSorted((a, b) => utility(b.validation) - utility(a.validation) || a.coefficient - b.coefficient)[0];
  const evaluation = { baseline: measure(rows.filter(r => r.year >= 2021), configs[0]), selected: measure(rows.filter(r => r.year >= 2021), selected) };
  await writeFile("src/lib/domain/competition-strength-calibration.json", JSON.stringify({ version: "Desk v1.4", coefficient: selected.coefficient, reference: selected.reference, cap: selected.cap, baselineRho: evaluation.baseline.rho, adjustedRho: evaluation.selected.rho, baselineNdcg: evaluation.baseline.ndcg5, adjustedNdcg: evaluation.selected.ndcg5 }, null, 2));
  await writeFile("docs/competition-strength-results.json", JSON.stringify({ reference, candidates, selected: { coefficient: selected.coefficient, reference: selected.reference, cap: selected.cap }, evaluation, note: "Exploratory revision requested by user. Initial combined-training-utility gate retained baseline; revised selection requires nondecreasing training correlation and both validation metrics. Maximize validation utility, tie toward lower coefficient. 2021–2023 are reused retrospective evaluation, not an untouched holdout. Advanced weights frozen at v1.3." }, null, 2));
  console.log(JSON.stringify({ reference, candidates: candidates.map(c => ({ coefficient: c.coefficient, train: [c.train.rho, c.train.ndcg5], validation: [c.validation.rho, c.validation.ndcg5] })), selected: selected.coefficient, evaluation }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });

