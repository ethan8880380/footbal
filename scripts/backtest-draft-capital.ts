import { readFile, writeFile } from "node:fs/promises";
import { evaluateCollegePlayer } from "../src/lib/domain/college-model";
import { advancedKey, blendAdvanced, type AdvancedProspect } from "../src/lib/domain/advanced-prospects";
import { draftPickScore } from "../src/lib/domain/draft-capital";
import { historicalFeatures, metrics, type HistoricalRow, type BacktestRow } from "../src/lib/domain/prospect-backtest";
async function main() {
  const advanced: AdvancedProspect[] = JSON.parse(await readFile("data/bakery-advanced/records.json", "utf8"));
  const lookup = new Map(advanced.map(r => [advancedKey(r.name, r.position, r.draftYear), r]));
  const raw: HistoricalRow[] = (await Promise.all(["dataset.json", "dataset-recent.json"].map(async f => JSON.parse(await readFile(`data/backtest/${f}`, "utf8")).rows))).flat().filter(r => r.draftYear <= 2023);
  const rows = raw.flatMap(r => { const features = historicalFeatures(r); return features ? [{ ...features, base: blendAdvanced(evaluateCollegePlayer(r.college, r.position).score, lookup.get(advancedKey(r.name, r.position, r.draftYear))).score!, capital: draftPickScore(r.pick)! }] : []; });
  const lookupRows = new Map(rows.map(r => [r.id, r]));
  const score = (r: BacktestRow, weight: number) => { const row = lookupRows.get(r.id)!; return Math.round((row.base * (1 - weight) + row.capital * weight) * 10) / 10; };
  const results = (["QB", "RB", "WR", "TE"] as const).map(position => {
    const group = rows.filter(r => r.position === position), train = group.filter(r => r.year <= 2018), validation = group.filter(r => r.year >= 2019 && r.year <= 2020), evaluation = group.filter(r => r.year >= 2021);
    const utility = (m: ReturnType<typeof metrics>) => ((m.rho ?? 0) + (m.ndcg5 ?? 0)) / 2;
    const candidates = [0, .2, .35, .5, .65].map(weight => ({ weight, train: metrics(train, r => score(r, weight)), validation: metrics(validation, r => score(r, weight)) }));
    const eligible = candidates.filter(c => c.weight === 0 || utility(c.train) > utility(candidates[0].train) && utility(c.validation) > utility(candidates[0].validation));
    const weight = eligible.toSorted((a, b) => utility(b.validation) - utility(a.validation) || a.weight - b.weight)[0].weight;
    return { position, weight, candidates, baseline: metrics(evaluation, r => score(r, 0)), adjusted: metrics(evaluation, r => score(r, weight)), draftOnly: metrics(evaluation, r => score(r, 1)) };
  });
  await writeFile("docs/draft-capital-backtest.json", JSON.stringify({ target: "First-three-season NFL PPR; post-draft model", training: "2016–2018", validation: "2019–2020", evaluation: "2021–2023 reused development classes", results }, null, 2));
  await writeFile("src/lib/domain/draft-capital-calibration.json", JSON.stringify({ version: "Desk v1.5", weights: Object.fromEntries(results.map(r => [r.position, r.weight])), results: results.map(({ position, weight, baseline, adjusted, draftOnly }) => ({ position, weight, baseline, adjusted, draftOnly })) }, null, 2));
  console.log(results.map(r => ({ position: r.position, weight: r.weight, before: r.baseline.rho, after: r.adjusted.rho, draftOnly: r.draftOnly.rho })));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
