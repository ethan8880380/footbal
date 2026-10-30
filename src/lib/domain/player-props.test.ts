import { describe, expect, it } from "vitest";
import { americanToProbability, expectedValue, propPlayerMatcher, scoreProjection, statsFromProps, topContributions } from "./player-props";

describe("expectedValue", () => {
  it("reads yardage lines as the median", () => {
    expect(expectedValue({ market: "receiving_yards", line: 64.5, overProbability: 0.5 })).toBe(64.5);
  });

  it("fits a Poisson mean to low-count lines from the over price", () => {
    const even = expectedValue({ market: "passing_touchdowns", line: 1.5, overProbability: 0.5 })!;
    const juiced = expectedValue({ market: "passing_touchdowns", line: 1.5, overProbability: 0.6 })!;
    expect(even).toBeCloseTo(1.68, 2);
    expect(juiced).toBeGreaterThan(even);
  });

  it("turns anytime-touchdown odds into expected touchdowns", () => {
    expect(expectedValue({ market: "touchdowns", line: null, overProbability: 0.5 })).toBeCloseTo(Math.LN2, 5);
  });

  it("converts American odds to probability", () => {
    expect(americanToProbability(-150)).toBeCloseTo(0.6, 5);
    expect(americanToProbability(150)).toBeCloseTo(0.4, 5);
  });
});

describe("statsFromProps", () => {
  const base = { rec: 4, rec_yd: 50, rec_fd: 2.5, rec_td: 0.3, rush_td: 0.1, bonus_rec_te: 4, fum_lost: 0.05 };

  it("overrides the base with prop means and keeps dependent stats in step", () => {
    const stats = statsFromProps(
      base,
      [
        { market: "receiving_receptions", line: 5.5, overProbability: 0.5 },
        { market: "receiving_yards", line: 75, overProbability: 0.5 },
        { market: "touchdowns", line: null, overProbability: 0.5 },
      ],
      ["TE"],
    );
    expect(stats).toMatchObject({ rec: 5.5, rec_yd: 75, bonus_rec_te: 5.5, rec_fd: 3.75, fum_lost: 0.05 });
    expect(stats.rec_td + stats.rush_td).toBeCloseTo(Math.LN2, 2);
    expect(stats.rec_td / (stats.rec_td + stats.rush_td)).toBeCloseTo(0.75, 1);
  });

  it("splits combined tackles by the base solo share", () => {
    const stats = statsFromProps({ idp_tkl_solo: 3, idp_tkl_ast: 1 }, [{ market: "defense_combinedTackles", line: 8, overProbability: 0.5 }], ["LB"]);
    expect(stats).toMatchObject({ idp_tkl_solo: 6, idp_tkl_ast: 2, idp_tkl: 8 });
  });
});

describe("scoreProjection", () => {
  it("applies league scoring to projected stats", () => {
    expect(scoreProjection({ rec: 5, rec_yd: 60, pts_ppr: 99 }, { rec: 0.5, rec_yd: 0.1 })).toBe(8.5);
    expect(topContributions({ rec: 5, rec_yd: 60 }, { rec: 0.5, rec_yd: 0.1 })[0]).toMatchObject({ label: "Receiving yards", points: 6 });
  });
});

describe("propPlayerMatcher", () => {
  const match = propPlayerMatcher([
    { playerId: "1", fullName: "Amon-Ra St. Brown", team: "DET" },
    { playerId: "2", fullName: "Marvin Harrison Jr.", team: "HOU" },
    { playerId: "3", fullName: "Josh Allen", team: "BUF" },
    { playerId: "4", fullName: "Josh Allen", team: "JAX" },
    { playerId: "5", fullName: "Puka Nacua", team: "LAR" },
  ]);

  it("matches across punctuation, suffixes, and team-code differences", () => {
    expect(match("Amon-Ra St Brown", "DET")).toBe("1");
    expect(match("Marvin Harrison", "HOU")).toBe("2");
    expect(match("Puka Nacua", "LA")).toBe("5");
  });

  it("uses the team to separate players who share a name, and never guesses between them", () => {
    expect(match("Josh Allen", "BUF")).toBe("3");
    expect(match("Josh Allen", "MIA")).toBeNull();
  });
});
