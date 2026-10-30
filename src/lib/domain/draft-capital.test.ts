import { describe, expect, it } from "vitest";
import { blendDraftCapital, draftPickScore, draftSignal, projectionScore, DRAFT_CALIBRATION } from "./draft-capital";

describe("draft capital", () => {
  it("rewards earlier picks monotonically and rejects invalid picks", () => {
    for (let pick = 2; pick <= 300; pick++) expect(draftPickScore(pick)!).toBeLessThanOrEqual(draftPickScore(pick - 1)!);
    expect(draftPickScore(0)).toBeNull();
    expect(draftPickScore(3.5)).toBeNull();
    expect(draftPickScore(301)).toBeNull();
    expect(draftPickScore(1)).toBe(100);
  });
  it("parses imported projected ranges without inventing an exact pick", () => {
    expect(projectionScore("Top10")).toBe(projectionScore("Top 10"));
    expect(projectionScore("1st Round")!).toBeGreaterThan(projectionScore("2nd Round")!);
    expect(projectionScore("7th Round")!).toBeGreaterThan(projectionScore("UDFA")!);
    expect(projectionScore("undrafted")).toBe(0);
    expect(projectionScore("WR1")).toBeNull();
    expect(projectionScore("")).toBeNull();
  });
  it("prefers actual picks and discounts uncertain projections", () => {
    const actual = draftSignal("RB", 3, "7th Round")!;
    const projected = draftSignal("RB", undefined, "Top 10")!;
    expect(actual.kind).toBe("Actual pick");
    expect(actual.score).toBe(draftPickScore(3));
    expect(actual.weight).toBe(DRAFT_CALIBRATION.weights.RB);
    expect(projected.weight).toBe(actual.weight / 2);
    expect(blendDraftCapital(null, actual)).toBeNull();
    expect(blendDraftCapital(60, null)).toBe(60);
    expect(blendDraftCapital(60, actual)!).toBeGreaterThan(60);
  });
});
