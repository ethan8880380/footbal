import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { ranks, spearman, weightGrid, splitRows, selectWeights, historicalFeatures, prediction, ORIGINAL_WEIGHTS, type BacktestRow, type HistoricalRow } from "./prospect-backtest";
import { collegePlayerSchema, evaluateCollegePlayer, COLLEGE_CALIBRATION } from "./college-model";

describe("historical prospect evaluation", () => {
  it("handles tied ranks and undefined correlations without reporting false accuracy", () => {
    expect(ranks([4, 2, 2, 8])).toEqual([3, 1.5, 1.5, 4]);
    expect(spearman([1, 2, 3], [3, 2, 1])).toBe(-1);
    expect(spearman([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(spearman([1, 2], [1, 2])).toBeNull();
  });
  it("keeps complete draft classes in disjoint chronological splits", () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ year: 2016 + i }) as BacktestRow);
    const splits = splitRows(rows);
    expect(splits.train.map(r => r.year)).toEqual([2016, 2017, 2018]);
    expect(splits.validation.map(r => r.year)).toEqual([2019, 2020]);
    expect(splits.test.map(r => r.year)).toEqual([2021, 2022]);
    expect(selectWeights([], [], ORIGINAL_WEIGHTS.QB)).toEqual(ORIGINAL_WEIGHTS.QB);
  });
  it("constrains weights to positive, interpretable proportions", () => {
    for (const weights of weightGrid()) {
      expect(weights.reduce((s, w) => s + w, 0)).toBeCloseTo(1);
      expect(weights.every(w => w >= .1 && w <= .7)).toBe(true);
    }
  });
  it("reproduces the runtime scorer and forbids post-draft features", () => {
    const season = { year: 2020, teamId: "1", school: "College", games: 8, receptions: 35, receivingYards: 400, receivingTD: 4, carries: 150, rushingYards: 900, rushingTD: 8, attempts: 0, completions: 0, passingYards: 0, passingTD: 0, interceptions: 0, teamPassingYards: 2500, teamRushingYards: 1800, teamPassingTD: 20, sourceUrl: "https://example.com/stats", teamSourceUrl: "https://example.com/team" };
    const college = collegePlayerSchema.parse({ prospectId: "p", athleteId: "1", name: "Player", school: "College", position: "RB", headshot: null, height: "", weight: null, fetchedAt: "2026-10-29", sourceUrl: "https://example.com", seasons: [season, { ...season, year: 2019, rushingYards: 450 }] });
    const row: HistoricalRow = { name: "Player", gsisId: "p", draftYear: 2021, position: "RB", pick: 100, college, outcome: 0 };
    const features = historicalFeatures(row)!;
    for (const weights of [ORIGINAL_WEIGHTS.RB, [.3, .3, .3, .1] as [number, number, number, number]]) expect(prediction(features, weights)).toBe(evaluateCollegePlayer(college, "RB", weights, 0).score);
    expect(() => historicalFeatures({ ...row, draftYear: 2020 })).toThrow("Post-draft");
  });
  it("keeps zero-production players and only deploys candidates that clear the holdout gate", () => {
    const report = JSON.parse(readFileSync("docs/prospect-backtest-results.json", "utf8"));
    const predictions = Papa.parse<Record<string, string>>(readFileSync("docs/prospect-backtest-predictions.csv", "utf8"), { header: true, skipEmptyLines: true }).data;
    expect(predictions.length).toBe(report.usable);
    expect(predictions.some(r => +r.nflFirst3PPR === 0)).toBe(true);
    for (const position of report.positions) {
      expect(COLLEGE_CALIBRATION.weights[position.position as keyof typeof COLLEGE_CALIBRATION.weights]).toEqual(position.deployed);
      if (position.promoted) {
        expect(position.test.candidate.rho).toBeGreaterThan(position.test.baseline.rho);
        expect(position.test.candidate.ndcg5).toBeGreaterThanOrEqual(position.test.baseline.ndcg5);
      }
    }
  });
});
