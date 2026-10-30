import { describe, expect, it } from "vitest";
import type { WeekEntry } from "./metrics";
import { impliedTotal, kickoffTime, leagueAverageImplied, projectPlayer, recentForm, teamLine, vegasMultiplier, type ProjectionInput } from "./projection";
import type { ScheduleGame } from "./types";

function game(overrides: Partial<ScheduleGame> = {}): ScheduleGame {
  return {
    gameId: "2026_09_AAA_BBB",
    season: 2026,
    week: 9,
    gameType: "REG",
    gameday: "2026-11-08",
    gametime: "13:00",
    homeTeam: "BBB",
    awayTeam: "AAA",
    homeScore: null,
    awayScore: null,
    spreadLine: 10,
    totalLine: 42.5,
    ...overrides,
  };
}

function played(week: number, points: number, gameId = `g${week}`, team = "BBB"): WeekEntry {
  return { week, team, gameId, gameday: null, status: "played", stats: {}, offenseSnaps: null, defenseSnaps: null, teamTotals: null, points };
}

function input(overrides: Partial<ProjectionInput> = {}): ProjectionInput {
  return {
    positions: ["WR"],
    weeks: [played(1, 10), played(2, 10)],
    priorPpg: null,
    hasTeam: true,
    line: teamLine(game(), "BBB"),
    injuryStatus: null,
    gamesById: new Map(),
    leagueImplied: 22,
    sleeperStats: null,
    props: null,
    scoring: { rec: 1, rec_yd: 0.1, rec_td: 6 },
    ...overrides,
  };
}

describe("impliedTotal", () => {
  it("splits the total by the spread, with a positive nflverse spread favoring the home team", () => {
    expect(impliedTotal(game(), "BBB")).toBe(26.25);
    expect(impliedTotal(game(), "AAA")).toBe(16.25);
    expect(impliedTotal(game({ spreadLine: null }), "BBB")).toBeNull();
  });

  it("reports the spread from the team's side, negative when favored", () => {
    expect(teamLine(game(), "BBB")).toMatchObject({ opponent: "AAA", isHome: true, spread: -10, implied: 26.25 });
    expect(teamLine(game(), "AAA")).toMatchObject({ opponent: "BBB", isHome: false, spread: 10, implied: 16.25 });
  });

  it("averages to half the mean total", () => {
    expect(leagueAverageImplied([game({ totalLine: 40 }), game({ totalLine: 50 }), game({ totalLine: null })])).toBe(22.5);
  });
});

describe("kickoffTime", () => {
  it("converts Eastern wall-clock kickoffs across the DST change", () => {
    expect(kickoffTime("2026-10-25", "13:00")?.toISOString()).toBe("2026-10-25T17:00:00.000Z");
    expect(kickoffTime("2026-11-08", "13:00")?.toISOString()).toBe("2026-11-08T18:00:00.000Z");
    expect(kickoffTime("2026-11-08", null)).toBeNull();
  });
});

describe("recentForm", () => {
  it("weights recent games more and shrinks toward last season", () => {
    expect(recentForm([played(1, 0), played(2, 20)], null)).toBeGreaterThan(10);
    expect(recentForm([], 15)).toBe(15);
    expect(recentForm([played(1, 30)], 10)).toBeCloseTo((30 + 2 * 10) / 3, 2);
    expect(recentForm([], null)).toBeNull();
  });
});

describe("vegasMultiplier", () => {
  it("scales with implied points relative to the player's usual environment", () => {
    const line = teamLine(game(), "BBB");
    expect(vegasMultiplier(["WR"], line, 26.25)).toBe(1);
    expect(vegasMultiplier(["WR"], line, 21)).toBeCloseTo(1 + 0.9 * (26.25 / 21 - 1), 3);
    expect(vegasMultiplier(["LB"], line, 21)).toBe(1);
  });

  it("scales two-way players by their offensive role", () => {
    const line = teamLine(game(), "BBB");
    expect(vegasMultiplier(["DB", "WR"], line, 21)).toBe(vegasMultiplier(["WR"], line, 21));
  });

  it("gives favored running backs a capped game-script boost", () => {
    const line = teamLine(game(), "BBB");
    expect(vegasMultiplier(["RB"], line, 26.25)).toBe(1.07);
    expect(vegasMultiplier(["RB"], teamLine(game(), "AAA"), 16.25)).toBe(0.93);
  });

  it("clamps extreme environments", () => {
    expect(vegasMultiplier(["QB"], teamLine(game({ totalLine: 70, spreadLine: 20 }), "BBB"), 15)).toBe(1.3);
  });
});

describe("projectPlayer", () => {
  it("applies form, Vegas, and availability", () => {
    const result = projectPlayer(input({ injuryStatus: "Questionable" }));
    expect(result.status).toBe("projected");
    expect(result.points).toBeCloseTo(10 * vegasMultiplier(["WR"], teamLine(game(), "BBB"), 22) * 0.85, 1);
  });

  it("measures the environment from the player's own lined games when available", () => {
    const history = new Map([["g1", game({ gameId: "g1", spreadLine: 10, totalLine: 42.5 })]]);
    expect(projectPlayer(input({ weeks: [played(1, 10)], gamesById: history })).vegas).toBe(1);
  });

  it("projects zero for byes, free agents, and ruled-out players", () => {
    expect(projectPlayer(input({ line: null }))).toMatchObject({ points: 0, status: "bye" });
    expect(projectPlayer(input({ hasTeam: false }))).toMatchObject({ points: 0, status: "free-agent" });
    expect(projectPlayer(input({ injuryStatus: "IR" }))).toMatchObject({ points: 0, status: "out" });
  });

  it("refuses to guess without any production", () => {
    expect(projectPlayer(input({ weeks: [] }))).toMatchObject({ points: null, status: "no-data" });
  });

  it("prefers prop lines, then Sleeper's projection, over the form model", () => {
    const sleeperStats = { rec: 5, rec_yd: 60, rec_td: 0.4 };
    expect(projectPlayer(input({ sleeperStats }))).toMatchObject({ source: "sleeper", points: 13.4 });
    const props = [{ market: "receiving_yards" as const, line: 80, overProbability: 0.5 }];
    expect(projectPlayer(input({ sleeperStats, props }))).toMatchObject({ source: "props", points: 15.4 });
    expect(projectPlayer(input({ weeks: [], props }))).toMatchObject({ source: "props", points: 8 });
  });

  it("still zeroes ruled-out players who have projections", () => {
    expect(projectPlayer(input({ sleeperStats: { rec: 5 }, injuryStatus: "Out" }))).toMatchObject({ points: 0, status: "out", source: null });
  });
});
