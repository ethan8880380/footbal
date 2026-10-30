import { describe, expect, it } from "vitest";
import { buildCollegeBoard } from "./college-model";
import { prospectSchema } from "./prospects";
import { BAKERY_CALIBRATION, indexBakeryGrades, type BakeryGrade } from "./bakery-grades";

const prospect = prospectSchema.parse({ id: "back", name: "Sample Back", school: "Boise State", position: "RB", draftYear: 2025, rank: 1, overall: 50, source: "Baseline", sourceUrl: "https://example.com", asOf: "2026-10-28" });
const grade: BakeryGrade = { name: "Sample Back", position: "RB", draftYear: 2025, school: "Boise State", tier: "Elite", grade: 12, overall: 90, zScore: 1.5, draftAge: 21.5 };

describe("Bakery grade blend", () => {
  it("replaces the production-only score and blends actual picks at the calibrated weight", () => {
    const history = { back: { draftPick: 1 } };
    const college = buildCollegeBoard([prospect], [], "1qb", [], history, false, [grade])[0];
    expect(college.collegeScore).toBe(90);
    expect(college.overall).toBe(90);
    const board = buildCollegeBoard([prospect], [], "1qb", [], history, true, [grade])[0];
    const weight = BAKERY_CALIBRATION.weights.RB;
    expect(board.draft?.weight).toBe(weight);
    expect(board.overall).toBe(Math.round((90 * (1 - weight) + 100 * weight) * 10) / 10);
  });
  it("labels where each grade comes from", () => {
    expect(buildCollegeBoard([prospect], [], "1qb", [], {}, false, [grade])[0].gradeSource).toBe("published");
    expect(buildCollegeBoard([prospect], [], "1qb", [], {}, false, [])[0].gradeSource).toBe("college");
  });
  it("ignores grades from another class and drops ambiguous matches", () => {
    expect(buildCollegeBoard([prospect], [], "1qb", [], {}, false, [{ ...grade, draftYear: 2024 }])[0].bakery).toBeNull();
    expect(indexBakeryGrades([grade, grade]).values().next().value).toBeNull();
    expect(buildCollegeBoard([prospect], [], "1qb", [], {}, false, [grade, grade])[0].bakery).toBeNull();
  });
});
