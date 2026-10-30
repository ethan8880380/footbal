import { readFile, writeFile } from "node:fs/promises";
import { evaluateCollegePlayer } from "../src/lib/domain/college-model";
import { advancedKey, blendAdvanced, type AdvancedProspect } from "../src/lib/domain/advanced-prospects";
import { blendDraftCapital, draftPickScore, DRAFT_CALIBRATION } from "../src/lib/domain/draft-capital";
import { indexBakeryGrades, bakeryGradeSchema } from "../src/lib/domain/bakery-grades";
import { metrics, type BacktestRow, type HistoricalRow } from "../src/lib/domain/prospect-backtest";

/** Chooses the draft-capital weight blended with the Bakery overall, per position, by class-stratified NFL outcome rank. */
const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
const MIN_CAPITAL_WEIGHT = .3;
const GRID = [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1];
async function main() {
  const grades = indexBakeryGrades(bakeryGradeSchema.array().parse(JSON.parse(await readFile("src/lib/data/bakery-grades.json", "utf8"))));
  const advanced: AdvancedProspect[] = JSON.parse(await readFile("data/bakery-advanced/records.json", "utf8"));
  const advancedIndex = new Map(advanced.map(r => [advancedKey(r.name, r.position, r.draftYear), r]));
  const raw: HistoricalRow[] = (await Promise.all(["dataset.json", "dataset-recent.json"].map(async f => JSON.parse(await readFile(`data/backtest/${f}`, "utf8")).rows))).flat().filter(r => r.draftYear <= 2023);
  const utility = (m: ReturnType<typeof metrics>) => ((m.rho ?? 0) + (m.ndcg5 ?? 0)) / 2;
  const results = POSITIONS.map(position => {
    const rows = raw.filter(r => r.position === position).flatMap(r => {
      const grade = grades.get(advancedKey(r.name, position, r.draftYear));
      const capital = draftPickScore(r.pick);
      if (!grade || capital === null) return [];
      const legacyBase = blendAdvanced(evaluateCollegePlayer(r.college, position).score, advancedIndex.get(advancedKey(r.name, position, r.draftYear))).score;
      const legacy = legacyBase === null ? null : blendDraftCapital(legacyBase, { kind: "Actual pick", label: "", score: capital, weight: DRAFT_CALIBRATION.weights[position] });
      return [{ name: r.name, id: r.gsisId, year: r.draftYear, position, pick: r.pick, features: [0, 0, 0, 0], outcome: r.outcome, overall: grade.overall, capital, legacy } as BacktestRow & { overall: number; capital: number; legacy: number | null }];
    });
    const blend = (w: number) => (r: BacktestRow) => { const row = r as (typeof rows)[number]; return row.overall * (1 - w) + row.capital * w; };
    const dev = rows.filter(r => r.year <= 2021), holdout = rows.filter(r => r.year >= 2022);
    const candidates = GRID.map(weight => ({ weight, all: metrics(rows, blend(weight)), development: metrics(dev, blend(weight)), holdout: metrics(holdout, blend(weight)) }));
    // Capital keeps a 0.3 floor: historical grades may have been tuned on these outcomes, and draft pick is the independent guard.
    const ranked = candidates.filter(c => c.weight >= MIN_CAPITAL_WEIGHT).toSorted((a, b) => utility(b.all) - utility(a.all) || Math.abs(a.weight - .5) - Math.abs(b.weight - .5));
    const best = ranked[0];
    const legacyRows = rows.filter(r => r.legacy !== null);
    return { position, n: rows.length, weight: best.weight, selected: best, bakeryOnly: candidates[0].all, draftOnly: candidates.at(-1)!.all, legacy: metrics(legacyRows, r => (r as (typeof rows)[number]).legacy!), candidates: candidates.map(c => ({ weight: c.weight, rho: c.all.rho, ndcg5: c.all.ndcg5 })) };
  });
  await writeFile("src/lib/domain/bakery-calibration.json", JSON.stringify({ version: "Desk v2", weights: Object.fromEntries(results.map(r => [r.position, r.weight])), results: results.map(r => ({ position: r.position, n: r.n, weight: r.weight, rho: r.selected.all.rho, ndcg5: r.selected.all.ndcg5, holdoutRho: r.selected.holdout.rho, bakeryOnlyRho: r.bakeryOnly.rho, draftOnlyRho: r.draftOnly.rho, legacyRho: r.legacy.rho, legacyNdcg5: r.legacy.ndcg5 })) }, null, 2) + "\n");
  console.table(results.map(r => ({ position: r.position, n: r.n, weight: r.weight, rho: r.selected.all.rho?.toFixed(3), ndcg5: r.selected.all.ndcg5?.toFixed(3), holdout: r.selected.holdout.rho?.toFixed(3), bakeryOnly: r.bakeryOnly.rho?.toFixed(3), draftOnly: r.draftOnly.rho?.toFixed(3), legacy: r.legacy.rho?.toFixed(3), legacyNdcg: r.legacy.ndcg5?.toFixed(3) })));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
