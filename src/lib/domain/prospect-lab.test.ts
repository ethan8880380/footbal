import { describe, expect, it } from "vitest";
import { fitRegression, fitTuned, regressionPrediction, selectInputs } from "./prospect-regression";
import { LAB_METRICS, labValues, percentile } from "./prospect-lab";
import { buildCollegeBoard, type CollegePlayer } from "./college-model";
import { prospectSchema } from "./prospects";
import calibration from "./prospect-lab-calibration.json";

describe("research regression", () => {
  const training = Array.from({ length: 30 }, (_, i) => ({ values: { signal: i, duplicate: i, constant: 7, sparse: i < 3 ? i : null }, outcome: Math.expm1(1 + i / 20) }));
  it("learns a signal despite collinearity and drops insufficient/constant inputs", () => {
    const model = fitRegression(training, ["signal", "duplicate", "constant", "sparse"], 1);
    expect(model.features.map(f => f.key)).toEqual(["signal", "duplicate"]);
    expect(regressionPrediction(model, { signal: 25, duplicate: 25 }).ppr).toBeGreaterThan(regressionPrediction(model, { signal: 5, duplicate: 5 }).ppr);
  });
  it("keeps observed zero distinct from missing and exactly decomposes prediction", () => {
    const model = fitRegression(training, ["signal"], 5);
    const missing = regressionPrediction(model, {}), zero = regressionPrediction(model, { signal: 0 });
    expect(missing.log).toBe(model.intercept);
    expect(missing.coverage).toBe(0);
    expect(zero.coverage).toBe(1);
    expect(zero.log).toBeLessThan(missing.log);
    expect(zero.log).toBeCloseTo(model.intercept + zero.contributions.reduce((s, c) => s + c.contribution, 0), 12);
    expect(regressionPrediction(model, { signal: 1e9 }).ppr).toBe(regressionPrediction(model, { signal: 1e8 }).ppr);
  });
  it("keeps the strongest inputs, always retains capital, and tunes on whole held-out classes", () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ values: { capital: i % 20, strong: i % 20 + (i % 3), noise: (i * 7) % 11, flat: 3 }, outcome: Math.expm1(1 + (i % 20) / 10) }));
    const years = rows.map((_, i) => 2016 + Math.floor(i / 20));
    expect(selectInputs(rows, ["noise", "strong", "capital", "flat"], 2)).toEqual(["capital", "strong"]);
    const tuned = fitTuned(rows, years, ["noise", "strong", "capital", "flat"]);
    expect(tuned.foldCount).toBe(3);
    expect(tuned.candidates[0].validationLogMse).toBe(Math.min(...tuned.candidates.map(c => c.validationLogMse)));
    expect(tuned.model.features.map(f => f.key)).not.toContain("flat");
    const capital = tuned.model.features.find(f => f.key === "capital")!;
    expect(capital.weight).toBeGreaterThan(0);
    expect(() => fitTuned(rows.slice(0, 10), years.slice(0, 10), ["capital"])).toThrow();
  });
  it("keeps evaluation outcomes and retrospective provider summaries out of fitted inputs", () => {
    for (const m of calibration.models) {
      expect(m.features.some(f => f.key.startsWith("advanced:") || /outcome|nfl|college/.test(f.key))).toBe(false);
      expect(m.features.some(f => f.key === "capital")).toBe(m.mode === "draft");
      expect(m.trainN).toBeGreaterThan(10);
      expect(m.candidates[0].validationLogMse).toBe(Math.min(...m.candidates.map(c => c.validationLogMse)));
    }
    expect(calibration.evaluations.every(e => e.year >= 2021 && e.year <= 2023 && Number.isFinite(e.predicted))).toBe(true);
  });
});

describe("metric integrity", () => {
  it("handles ties, lower-is-better and absent percentiles", () => {
    expect(percentile(2, [1, 2, 2, 3])).toBe(50);
    expect(percentile(1, [1, 2, 3], true)).toBeCloseTo(83.3333);
    expect(percentile(null, [1, 2])).toBeNull();
    expect(percentile(1, [])).toBeNull();
    expect(new Set(LAB_METRICS.map(m => m.key)).size).toBe(LAB_METRICS.length);
  });
  it("excludes post-draft production, does not borrow projected athletic tests, and preserves null denominators", () => {
    const prospect = prospectSchema.parse({ id: "test", name: "Test", school: "School", position: "WR", draftYear: 2027, rank: 1, forty: 4.2, source: "Test", sourceUrl: "https://example.com", asOf: "2026-10-29" });
    const season = { year: 2026, teamId: "1", school: "School", games: 10, receptions: 50, receivingYards: 1000, receivingTD: 10, carries: 0, rushingYards: 0, rushingTD: 0, attempts: 0, completions: 0, passingYards: 0, passingTD: 0, interceptions: 0, teamPassingYards: 2500, teamRushingYards: null, teamPassingTD: 0, sourceUrl: "https://example.com", teamSourceUrl: null };
    const player: CollegePlayer = { prospectId: "test", athleteId: "1", name: "Test", school: "School", position: "WR", height: "", weight: null, headshot: null, seasons: [season, { ...season, year: 2027, receivingYards: 9999 }], fetchedAt: "2026-10-29", sourceUrl: "https://example.com" };
    const values = labValues(buildCollegeBoard([prospect], [player])[0]);
    expect(values.recpg).toBe(100);
    expect(values.peak).toBe(100);
    expect(values.tdshare).toBeNull();
    expect(values.dominator).toBeNull();
    expect(values.forty).toBeUndefined();
    expect(values.ypc).toBeNull();
    expect(values.seasons).toBe(1);
  });
});
