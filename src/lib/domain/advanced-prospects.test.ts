import { describe, expect, it } from "vitest";
import { advancedKey, advancedScore, blendAdvanced, metricDisplay, type AdvancedProspect } from "./advanced-prospects";

const record: AdvancedProspect = { name: "Sample Receiver", position: "WR", draftYear: 2027, school: "School", sourceUrl: "https://example.com", capturedAt: "2026-10-29", metrics: { "Y/RR": 3, "T/RR": .25, UCTPRR: .20, "YAC/R": 6, "Drop%": .04 } };
describe("advanced prospect analytics", () => {
  it("keeps missing measurements missing and never creates an unscored player's grade", () => {
    expect(advancedScore({ ...record, metrics: { "Y/RR": 4 } })).toBeNull();
    expect(blendAdvanced(60, null, .3)).toMatchObject({ score: 60, weight: 0 });
    expect(blendAdvanced(null, record, .3).score).toBeNull();
    expect(metricDisplay("T/RR", null)).toBe("—");
    expect(metricDisplay("T/RR", .25)).toBe("25.0%");
  });
  it("excludes provider grades and outcomes, and rewards fewer drops", () => {
    const score = advancedScore(record)!.score;
    expect(advancedScore({ ...record, metrics: { ...record.metrics, Overall: 100, Grade: 100, Pick: 1, BestFinish: 1 } })!.score).toBe(score);
    expect(advancedScore({ ...record, metrics: { ...record.metrics, "Drop%": .10 } })!.score).toBeLessThan(score);
  });
  it("matches normalized full names within position and class only", () => {
    expect(advancedKey("Ja'Marr Chase", "WR", 2021)).toBe(advancedKey("Ja’Marr Chase", "WR", 2021));
    expect(advancedKey("John Smith Jr.", "WR", 2021)).toBe(advancedKey("John Smith", "WR", 2021));
    expect(advancedKey("John Smith", "WR", 2021)).not.toBe(advancedKey("John Smith", "WR", 2022));
  });
});
