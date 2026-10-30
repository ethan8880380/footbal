import { describe, expect, it } from "vitest";
import { buildMetricEvidence, buildWeekLog, summarizeWindow, teamTotalsKey, type SeasonData } from "./metrics";
import { analyzeScoringSupport } from "./scoring";
import type { ScheduleGame, TeamGameTotals } from "./types";

const scoring = { settings: { rec: 1, rec_yd: 0.1, rec_td: 6 }, support: analyzeScoringSupport({ rec: 1, rec_yd: 0.1, rec_td: 6 }) };

function game(week: number, home: string, away: string, played = true): ScheduleGame {
  return { gameId: `g${week}-${home}`, season: 2026, week, gameType: "REG", gameday: `2026-09-${10 + week}`, homeTeam: home, awayTeam: away, homeScore: played ? 20 : null, awayScore: played ? 17 : null };
}

function totals(gameId: string, week: number, targets: number): TeamGameTotals {
  return { gameId, season: 2026, week, team: "AAA", targets, carries: 25, airYards: 300, passAttempts: targets, offenseSnaps: 60, defenseSnaps: 60, hasSnapCoverage: true };
}

function season(): SeasonData {
  const schedule = [game(1, "AAA", "BBB"), game(2, "AAA", "CCC"), game(4, "AAA", "DDD"), game(5, "AAA", "EEE"), game(6, "AAA", "FFF", false), game(3, "XXX", "YYY")];
  const teamTotals = new Map<string, TeamGameTotals>();
  for (const [id, week, targets] of [["g1-AAA", 1, 40], ["g2-AAA", 2, 20], ["g4-AAA", 4, 30], ["g5-AAA", 5, 35]] as const) {
    teamTotals.set(teamTotalsKey(id, "AAA"), totals(id, week, targets));
  }
  return {
    season: 2026,
    schedule,
    statWeeks: [
      { season: 2026, week: 1, seasonType: "REG", gsisId: "G1", gameId: "g1-AAA", team: "AAA", stats: { targets: 4, receptions: 3, receiving_yards: 30, receiving_tds: 0 } },
      { season: 2026, week: 2, seasonType: "REG", gsisId: "G1", gameId: "g2-AAA", team: "AAA", stats: { targets: 10, receptions: 8, receiving_yards: 100, receiving_tds: 1 } },
    ],
    snapWeeks: [
      { gameId: "g1-AAA", pfrId: "P1", season: 2026, week: 1, team: "AAA", offenseSnaps: 30, defenseSnaps: 0, stSnaps: 0 },
      { gameId: "g2-AAA", pfrId: "P1", season: 2026, week: 2, team: "AAA", offenseSnaps: 50, defenseSnaps: 0, stSnaps: 0 },
      { gameId: "g5-AAA", pfrId: "P1", season: 2026, week: 5, team: "AAA", offenseSnaps: 12, defenseSnaps: 0, stSnaps: 0 },
      { gameId: "g4-AAA", pfrId: "OTHER", season: 2026, week: 4, team: "AAA", offenseSnaps: 60, defenseSnaps: 0, stSnaps: 0 },
    ],
    teamTotals,
    retrievedAt: "2026-10-28T00:00:00Z",
  };
}

const player = { playerId: "s1", position: "WR", currentTeam: "AAA", gsisId: "G1", pfrId: "P1" };

describe("week classification", () => {
  it("distinguishes byes, inactive games, snap-only games, and upcoming games", () => {
    const weeks = buildWeekLog(player, season(), scoring);
    expect(weeks.map((w) => [w.week, w.status])).toEqual([
      [1, "played"],
      [2, "played"],
      [3, "bye"],
      [4, "inactive"],
      [5, "played"],
      [6, "upcoming"],
    ]);
    expect(weeks[4].points).toBe(0);
    expect(weeks[3].points).toBeNull();
  });

  it("keeps every metric null when the player cannot be joined to stats", () => {
    const unresolved = { ...player, gsisId: null, pfrId: null };
    const weeks = buildWeekLog(unresolved, season(), scoring);
    expect(weeks.filter((w) => w.status === "played")).toHaveLength(0);
    const window = summarizeWindow(weeks, "season");
    expect(window.points).toBeNull();
    expect(window.pointsPerGame).toBeNull();
    const evidence = buildMetricEvidence("s1", "WR", 2026, window, null);
    const targetShare = evidence.find((e) => e.metricKey === "target_share");
    expect(targetShare?.value).toBeNull();
    expect(evidence.find((e) => e.metricKey === "targets")?.value).toBeNull();
  });
});

describe("rate aggregation", () => {
  it("divides summed numerators by summed denominators instead of averaging weekly rates", () => {
    const window = summarizeWindow(buildWeekLog(player, season(), scoring), "season");
    const share = buildMetricEvidence("s1", "WR", 2026, window, null).find((e) => e.metricKey === "target_share");
    // Games played: weeks 1, 2, and 5 (snap-only). Targets 4 + 10 + 0 over team targets 40 + 20 + 35.
    expect(share?.value).toBeCloseTo((14 / 95) * 100, 1);
    // An unweighted average of weekly shares would be (10% + 50% + 0%) / 3 = 20%.
    expect(share?.value).not.toBeCloseTo(20, 0);
    expect(share?.sampleSize).toBe(3);
  });

  it("scores recorded games and uses games played as the per-game denominator", () => {
    const window = summarizeWindow(buildWeekLog(player, season(), scoring), "season");
    // Week 1: 3 + 3 = 6. Week 2: 8 + 10 + 6 = 24. Week 5: 0.
    expect(window.points).toBe(30);
    expect(window.gamesPlayed).toBe(3);
    expect(window.pointsPerGame).toBe(10);
    expect(window.inactive).toBe(1);
    expect(window.byes).toBe(1);
  });

  it("defines the recent window as the last four completed team games", () => {
    const recent = summarizeWindow(buildWeekLog(player, season(), scoring), "recent");
    expect(recent.weekStart).toBe(1);
    expect(recent.weekEnd).toBe(5);
    expect(recent.teamGames).toBe(4);
  });
});
