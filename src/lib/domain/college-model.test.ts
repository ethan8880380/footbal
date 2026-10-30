import { describe, expect, it } from "vitest";
import { buildCollegeBoard, evaluateCollegePlayer, ratio, scoreCollegeSeason, type CollegePlayer, type CollegeSeason } from "./college-model";
import { prospectSchema } from "./prospects";
import { ADVANCED_CALIBRATION, advancedScore, type AdvancedProspect } from "./advanced-prospects";

const season: CollegeSeason = { year: 2026, teamId: "194", school: "Ohio State", games: 8, receptions: 55, receivingYards: 900, receivingTD: 9, carries: 0, rushingYards: 0, rushingTD: 0, attempts: 0, completions: 0, passingYards: 0, passingTD: 0, interceptions: 0, teamPassingYards: 2500, teamRushingYards: 1200, teamPassingTD: 25, sourceUrl: "https://example.com/player", teamSourceUrl: "https://example.com/team" };
const player: CollegePlayer = { prospectId: "receiver", athleteId: "1", name: "Sample Receiver", school: "Ohio State", position: "WR", height: "6'2\"", weight: 200, headshot: null, seasons: [season], fetchedAt: "2026-10-29T01:00:00Z", sourceUrl: "https://example.com" };
const prospect = prospectSchema.parse({ id: "receiver", name: player.name, school: player.school, position: "WR", draftYear: 2027, rank: 1, overall: 99, source: "Baseline", sourceUrl: "https://example.com", asOf: "2026-10-28" });

describe("independent college production model", () => {
  it("separates post-draft and college-only grades and never consumes NFL outcomes", () => {
    const history = { receiver: { draftPick: 5, nflPpr: 0 } };
    const actual = buildCollegeBoard([prospect], [player], "1qb", [], history)[0];
    const changedOutcomes = { receiver: { draftPick: 5, nflPpr: 9999 } };
    expect(buildCollegeBoard([prospect], [player], "1qb", [], changedOutcomes)[0].overall).toBe(actual.overall);
    const college = buildCollegeBoard([prospect], [player], "1qb", [], history, false)[0];
    expect(college.draft).toBeNull();
    expect(college.overall).toBe(actual.collegeScore);
    expect(actual.overall).not.toBe(college.overall);
    const projected = buildCollegeBoard([{ ...prospect, projection: "Top10" }], [player])[0];
    expect(projected.draft?.kind).toBe("Projection");
    expect(projected.draft!.weight).toBe(actual.draft!.weight / 2);
  });
  it("uses the selected TE blend and rejects ambiguous advanced matches", () => {
    const te = { ...prospect, position: "TE" as const };
    const production = { ...player, position: "TE" as const };
    const advanced: AdvancedProspect = { name: te.name, position: "TE", draftYear: te.draftYear, school: te.school, capturedAt: "2026-10-29", sourceUrl: "https://example.com", metrics: { "Y/RR": 2.5, "T/RR": .25, UCTPRR: .20, "YAC/R": 5, "Drop%": .05 } };
    const baseline = buildCollegeBoard([te], [production])[0];
    const row = buildCollegeBoard([te], [production], "1qb", [advanced])[0];
    const weight = ADVANCED_CALIBRATION.weights.TE;
    expect(row.overall).toBe(Math.round((baseline.overall! * (1 - weight) + advancedScore(advanced)!.score * weight) * 10) / 10);
    expect(buildCollegeBoard([te], [production], "1qb", [advanced, advanced])[0].advanced).toBeNull();
    expect(buildCollegeBoard([te], [production], "1qb", [{ ...advanced, draftYear: 2026 }])[0].overall).toBe(baseline.overall);
  });
  it("never fabricates ratios for missing or zero denominators", () => {
    expect(ratio(20, 0)).toBeNull();
    expect(ratio(null, 10)).toBeNull();
    expect(ratio(0, 10)).toBe(0);
  });
  it("does not rank a one-game explosion or no data", () => {
    expect(scoreCollegeSeason({ ...season, games: 1, receivingYards: 500 }, "WR")).toBeNull();
    expect(evaluateCollegePlayer(null, "WR").score).toBeNull();
    expect(scoreCollegeSeason({ ...season, games: null }, "WR")).toBeNull();
  });
  it("shrinks small samples and exposes missing coverage", () => {
    const full = scoreCollegeSeason(season, "WR")!;
    const small = scoreCollegeSeason({ ...season, games: 3, receptions: 21, receivingYards: 340, teamPassingYards: 945 }, "WR")!;
    expect(small.score).toBeLessThan(full.score);
    const missing = scoreCollegeSeason({ ...season, teamPassingYards: null }, "WR")!;
    expect(missing.coverage).toBeCloseTo(.65);
    expect(missing.components[0].value).toBeNull();
    expect(missing.score).toBeLessThan(full.score);
  });
  it("is independent of Bakery rank, scores, ages and projected forty times", () => {
    const original = buildCollegeBoard([prospect], [player])[0];
    const changed = buildCollegeBoard([{ ...prospect, rank: 215, overall: 1, grade: -5, zScore: -3, forty: 4.1, draftAge: 18 }], [player])[0];
    expect(changed.overall).toBe(original.overall);
    expect(changed.rank).toBe(original.rank);
    expect(changed.baselineRank).toBe(215);
    expect(changed.forty).toBeNull();
    expect(changed.draftAge).toBeNull();
  });
  it("uses explicit recency weights, independent of season input order", () => {
    const old = { ...season, year: 2025, receivingYards: 500 };
    const model = evaluateCollegePlayer({ ...player, seasons: [old, season] }, "WR");
    const expected = .65 * scoreCollegeSeason(season, "WR")!.score + .35 * scoreCollegeSeason(old, "WR")!.score;
    expect(model.score).toBe(Math.round(expected * 10) / 10);
    expect(model.seasons[0].season.year).toBe(2026);
  });
  it("flags a score based on older seasons when the newest sample is insufficient", () => {
    const model = evaluateCollegePlayer({ ...player, seasons: [{ ...season, year: 2025 }, { ...season, games: 2 }] }, "WR");
    expect(model.confidence).toBe("Low");
    expect(model.seasons[0].season.year).toBe(2025);
  });
  it("applies the 1QB adjustment only to QBs", () => {
    const qb = { ...prospect, id: "qb", position: "QB" as const };
    const passer = { ...player, prospectId: "qb", position: "QB" as const, seasons: [{ ...season, attempts: 250, completions: 180, passingYards: 2600, passingTD: 25, interceptions: 5, rushingYards: 300 }] };
    const one = buildCollegeBoard([qb], [passer], "1qb")[0];
    const sf = buildCollegeBoard([qb], [passer], "sf")[0];
    expect(sf.overall! - one.overall!).toBeCloseTo(8);
  });
  it("ranks missing players last without inheriting baseline scores", () => {
    const rows = buildCollegeBoard([{ ...prospect, id: "missing", rank: 1 }, { ...prospect, rank: 200 }], [player]);
    expect(rows.map(r => r.id)).toEqual(["receiver", "missing"]);
    expect(rows[1].overall).toBeNull();
  });
});
