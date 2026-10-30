import { describe, expect, it } from "vitest";
import historical from "../data/historical-prospects.json";
import { collegePlayerSchema, buildCollegeBoard } from "./college-model";
import { prospectSchema } from "./prospects";

describe("historical prospect archive", () => {
  it("contains validated pre-draft profiles and equally observed NFL outcomes", () => {
    expect(historical.entries).toHaveLength(843);
    expect([...new Set(historical.entries.map(e => e.prospect.draftYear))].sort()).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
    const ids = new Set<string>();
    for (const entry of historical.entries) {
      const prospect = prospectSchema.parse(entry.prospect);
      const college = collegePlayerSchema.parse(entry.college);
      expect(ids.has(prospect.id)).toBe(false);
      ids.add(prospect.id);
      expect(college.prospectId).toBe(prospect.id);
      expect(college.seasons.every(s => s.year < prospect.draftYear)).toBe(true);
      expect(entry.history.seasons.map(s => s.year)).toEqual([prospect.draftYear, prospect.draftYear + 1, prospect.draftYear + 2].filter(year => year <= 2026));
      expect(entry.history.complete).toBe(prospect.draftYear <= 2023);
      if (prospect.draftYear >= 2024) {
        expect(entry.history.window).toContain("Partial");
        expect(entry.history.seasons.at(-1)?.complete).toBe(false);
      }
      if (prospect.draftYear === 2023) expect(entry.history.sample).toBe("Competition evaluation");
      if (prospect.draftYear > 2023) expect(entry.history.sample).toBe("Not used in backtest");
      expect(entry.history.seasons.reduce((n, s) => n + s.ppr, 0)).toBeCloseTo(entry.history.nflPpr);
      expect(entry.history.draftPick).toBe(prospect.rank);
    }
  });
  it("grades recognizable NFL players without using their NFL outcomes", () => {
    const entry = historical.entries.find(e => e.prospect.name === "Justin Jefferson")!;
    expect(entry.prospect.draftYear).toBe(2020);
    expect(entry.history.nflPpr).toBeGreaterThan(0);
    const result = buildCollegeBoard([prospectSchema.parse(entry.prospect)], [collegePlayerSchema.parse(entry.college)])[0];
    expect(result.overall).not.toBeNull();
    expect(result.model.seasons.every(s => s.season.year < 2020)).toBe(true);
    expect(historical.entries.some(e => e.history.nflPpr === 0)).toBe(true);
  });
});
