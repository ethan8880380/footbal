import { describe, expect, it } from "vitest";
import { competitionPoints, rateCollegeSchedules, type CollegeGame } from "./competition";

const game: CollegeGame = { id: "1", year: 2025, home: "A", away: "B", homeScore: 24, awayScore: 10, neutral: true };
describe("competition strength", () => {
  it("discounts schedules below the drafted-prospect reference and bounds stronger adjustments", () => {
    const schedule = { games: 12, opponents: 1.25, rating: 0 };
    expect(competitionPoints(schedule, 40, 1, 3.5, 25)).toBe(-9);
    expect(competitionPoints({ ...schedule, opponents: 5.2 }, 40, 1, 3.5, 25)).toBeCloseTo(6.8);
    expect(competitionPoints({ ...schedule, opponents: 20 }, 40, .25, 3.5, 25)).toBe(12.5);
    expect(competitionPoints(undefined, 40, 1, 3.5, 25)).toBe(0);
  });
  it("uses opponent ratings and deduplicates scoreboard copies", () => {
    const result = rateCollegeSchedules([game, game]);
    expect(result.A.games).toBe(1);
    expect(result.A.rating).toBeGreaterThan(0);
    expect(result.B.rating).toBeLessThan(0);
    expect(result.A.opponents).toBe(result.B.rating);
    expect(result.B.opponents).toBe(result.A.rating);
  });
  it("caps blowouts and accounts for home advantage", () => {
    expect(rateCollegeSchedules([{ ...game, homeScore: 100 }])).toEqual(rateCollegeSchedules([{ ...game, homeScore: 38 }]));
    const home = rateCollegeSchedules([{ ...game, neutral: false, homeScore: 13 }]);
    expect(home.A.rating).toBe(0);
  });
  it("does not penalize missing schedules and shrinks small samples", () => {
    expect(competitionPoints(undefined, 16, 1)).toBe(0);
    expect(competitionPoints({ games: 3, opponents: -20, rating: 0 }, 16, 1)).toBe(0);
    expect(competitionPoints({ games: 8, opponents: 20, rating: 0 }, 16, .25)).toBe(7.5);
    expect(competitionPoints({ games: 8, opponents: -20, rating: 0 }, 16, 1)).toBe(-15);
  });
});
