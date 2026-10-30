import { describe, expect, it } from "vitest";
import { DEFENSE_CALIBRATION, isDefensePosition, predictDefense } from "./defense-model";

const season = (year: number, tackles: number, sacks: number) => ({ year, games: 12, tackles, solo: tackles * .6, assists: tackles * .4, sacks, forcedFumbles: 1, interceptions: 0, passesDefended: 2 });

describe("defense model", () => {
  it("recognizes defensive positions only", () => {
    expect(isDefensePosition("DL")).toBe(true);
    expect(isDefensePosition("RB")).toBe(false);
  });
  it("scores producers above non-producers and refuses empty input", () => {
    const fit = DEFENSE_CALIBRATION.fits.DL;
    if (!fit) return;
    const star = predictDefense("DL", { seasons: [season(2023, 70, 12), season(2022, 50, 8)], height: 76, weight: 270 });
    const bench = predictDefense("DL", { seasons: [season(2023, 10, 0), season(2022, 8, 0)], height: 76, weight: 270 });
    expect(star!.score).toBeGreaterThan(bench!.score);
    expect(predictDefense("DL", { seasons: [], height: null, weight: null })).toBeNull();
  });
});
