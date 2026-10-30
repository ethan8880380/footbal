import type { LeagueDataset } from "@/lib/analysis/dataset";
import { getLeagueConfig } from "@/lib/db/repositories/settings-repository";
import { teamTotalsKey } from "@/lib/domain/metrics";
import type {
  MarketSnapshot,
  PlayerRecord,
  RosterRecord,
  ScheduleGame,
  SnapWeekRecord,
  StatWeekRecord,
  TeamGameTotals,
} from "@/lib/domain/types";

export const DEMO_LEAGUE_ID = "demo";
const SEASON = 2026;
const WEEKS = 8;
const NFL_TEAMS = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH", "III", "JJJ"];
const ROSTER_TEMPLATE: [string, number][] = [["QB", 3], ["RB", 6], ["WR", 8], ["TE", 3]];
const FIRST = ["Avery", "Blake", "Casey", "Drew", "Emery", "Finley", "Gray", "Harper", "Indy", "Jules", "Kai", "Lane", "Morgan", "Noel", "Oakley", "Parker", "Quinn", "Reese", "Sage", "Tatum"];
const LAST = ["Ashford", "Brook", "Calder", "Dalton", "Ellis", "Fenwick", "Garrow", "Hollis", "Irving", "Jansen", "Keane", "Lorne", "Marlow", "Nash", "Orrin", "Pryce", "Quill", "Rowan", "Slate", "Thorne"];
const TEAM_NAMES = ["Demo Dynasty", "Synthetic Stars", "Sample Squad", "Fixture FC", "Mock Mavericks", "Placeholder Pros", "Test Titans", "Stub United", "Seeded Saints", "Generated Giants"];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Synthetic, deterministic league. Never stored in live tables and never presented as NFL evidence. */
export async function loadDemoDataset(): Promise<LeagueDataset> {
  const random = rng(42);
  const retrievedAt = "2026-10-20T12:00:00.000Z";
  const players = new Map<string, PlayerRecord>();
  const talent = new Map<string, number>();
  const rosters: RosterRecord[] = [];

  let counter = 0;
  for (let t = 0; t < TEAM_NAMES.length; t++) {
    const ids: string[] = [];
    for (const [position, count] of ROSTER_TEMPLATE) {
      for (let i = 0; i < count; i++) {
        counter++;
        const id = `demo-${counter}`;
        const age = Math.round((21 + random() * 12) * 10) / 10;
        const skill = Math.min(1, Math.max(0.05, random() ** 1.3 + (i === 0 ? 0.25 : 0)));
        talent.set(id, skill);
        players.set(id, {
          playerId: id,
          fullName: `${FIRST[counter % FIRST.length]} ${LAST[Math.floor(counter / FIRST.length) % LAST.length]}`,
          position,
          fantasyPositions: [position],
          team: NFL_TEAMS[counter % NFL_TEAMS.length],
          age: Math.floor(age),
          birthDate: new Date(Date.UTC(2026 - Math.floor(age), 9 - Math.round((age % 1) * 12), 1)).toISOString().slice(0, 10),
          yearsExp: Math.max(0, Math.floor(age - 22)),
          rookieYear: null,
          college: null,
          status: "Active",
          injuryStatus: random() < 0.06 ? "Questionable" : null,
          injuryBodyPart: null,
          injuryStartDate: null,
          injuryNotes: null,
          practiceParticipation: null,
          depthChartPosition: position,
          depthChartOrder: i + 1,
          newsUpdated: null,
          retrievedAt,
        });
        ids.push(id);
      }
    }
    rosters.push({
      rosterId: String(t + 1),
      ownerId: t === 7 ? null : `demo-user-${t + 1}`,
      coOwners: t === 2 ? ["demo-user-co"] : [],
      players: ids,
      starters: ids.slice(0, 1),
      reserve: [],
      taxi: ids.slice(-1),
      settings: {},
    });
  }

  const schedule: ScheduleGame[] = [];
  for (let week = 1; week <= WEEKS + 2; week++) {
    const bye = week === 5 ? new Set(["AAA", "BBB"]) : new Set<string>();
    const active = NFL_TEAMS.filter((team) => !bye.has(team));
    const rotated = [active[0], ...active.slice(1).map((_, i, arr) => arr[(i + week) % arr.length])];
    for (let g = 0; g < rotated.length / 2; g++) {
      schedule.push({
        gameId: `demo_${week}_${g}`,
        season: SEASON,
        week,
        gameType: "REG",
        gameday: `2026-${week <= 3 ? "09" : "10"}-${String(((week * 7) % 28) + 1).padStart(2, "0")}`,
        homeTeam: rotated[g],
        awayTeam: rotated[rotated.length - 1 - g],
        homeScore: week <= WEEKS ? 20 : null,
        awayScore: week <= WEEKS ? 17 : null,
      });
    }
  }

  const statWeeks: StatWeekRecord[] = [];
  const snapWeeks: SnapWeekRecord[] = [];
  const gameFor = (team: string, week: number) => schedule.find((g) => g.week === week && (g.homeTeam === team || g.awayTeam === team));
  for (const [id, player] of players) {
    const skill = talent.get(id) ?? 0.3;
    for (let week = 1; week <= WEEKS; week++) {
      const game = gameFor(player.team!, week);
      if (!game) continue;
      if (random() < 0.08) continue;
      const usage = Math.max(0, skill + (random() - 0.5) * 0.3);
      const stats = syntheticLine(player.position!, usage, random);
      statWeeks.push({ season: SEASON, week, seasonType: "REG", gsisId: id, gameId: game.gameId, team: player.team!, stats });
      snapWeeks.push({ gameId: game.gameId, pfrId: id, season: SEASON, week, team: player.team!, offenseSnaps: Math.round(65 * Math.min(1, 0.3 + usage)), defenseSnaps: 0, stSnaps: 0 });
    }
  }

  const totals = new Map<string, TeamGameTotals>();
  for (const row of statWeeks) {
    const key = teamTotalsKey(row.gameId!, row.team);
    const entry = totals.get(key) ?? { gameId: row.gameId!, season: SEASON, week: row.week, team: row.team, targets: 0, carries: 0, airYards: 0, passAttempts: 0, offenseSnaps: 65, defenseSnaps: 65, hasSnapCoverage: true };
    entry.targets += (row.stats.targets ?? 0) + 6;
    entry.carries += (row.stats.carries ?? 0) + 3;
    entry.airYards += (row.stats.receiving_air_yards ?? 0) + 40;
    entry.passAttempts += row.stats.attempts ?? 0;
    totals.set(key, entry);
  }

  const values = new Map<string, MarketSnapshot["values"] extends Map<string, infer V> ? V : never>();
  for (const [id, player] of players) {
    const skill = talent.get(id) ?? 0.3;
    const ageFactor = Math.max(0.25, 1 - Math.max(0, (player.age ?? 25) - 26) * 0.08);
    const qbBoost = player.position === "QB" ? 1.2 : 1;
    const value = Math.round(Math.min(10_000, 9_500 * skill ** 1.6 * ageFactor * qbBoost));
    values.set(id, { playerId: id, value: value > 150 ? value : null, rank: null, positionRank: null, change7d: null, change30d: Math.round((random() - 0.45) * value * 0.3), url: null });
  }
  const picks = new Map<string, MarketSnapshot["picks"] extends Map<string, infer V> ? V : never>();
  for (const year of [2027, 2028, 2029]) {
    for (let round = 1; round <= 4; round++) {
      const mid = Math.round(4_200 / round ** 1.7);
      for (const [variant, factor] of [["early", 1.35], ["mid", 1], ["late", 0.75]] as const) {
        const pickId = `pick:${year}:${round}:${variant}`;
        picks.set(pickId, { pickId, year, round, slot: null, variant, value: Math.round(mid * factor * (year === 2027 ? 1 : 0.92)) });
      }
    }
  }

  const config = await getLeagueConfig(DEMO_LEAGUE_ID);
  if (!config.myRosterId) config.myRosterId = "1";

  return {
    mode: "demo",
    league: {
      leagueId: DEMO_LEAGUE_ID,
      name: "Demo league (synthetic)",
      season: String(SEASON),
      status: "in_season",
      totalRosters: rosters.length,
      settings: { type: 2, draft_rounds: 4, reserve_slots: 2, taxi_slots: 3 },
      scoringSettings: { pass_yd: 0.04, pass_td: 4, pass_int: -2, rush_yd: 0.1, rush_td: 6, rec: 0.5, rec_yd: 0.1, rec_td: 6, bonus_rec_te: 0.5, fum_lost: -2 },
      rosterPositions: ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "FLEX", "SUPER_FLEX", ...Array(12).fill("BN"), "TAXI", "TAXI", "TAXI"],
      avatar: null,
      retrievedAt,
    },
    members: rosters.filter((r) => r.ownerId).map((r, i) => ({ userId: r.ownerId!, displayName: `demo_manager_${i + 1}`, teamName: TEAM_NAMES[Number(r.rosterId) - 1], avatar: null })),
    rosters,
    drafts: [
      { draftId: "demo-draft-2026", season: "2026", status: "complete", rounds: 4, slotToRosterId: null },
      { draftId: "demo-draft-2027", season: "2027", status: "pre_draft", rounds: 4, slotToRosterId: null },
    ],
    tradedPicks: [
      { season: "2027", round: 1, originalRosterId: "4", ownerRosterId: "1", previousOwnerRosterId: "4" },
      { season: "2027", round: 2, originalRosterId: "1", ownerRosterId: "6", previousOwnerRosterId: "1" },
      { season: "2028", round: 1, originalRosterId: "9", ownerRosterId: "3", previousOwnerRosterId: "9" },
    ],
    players,
    identities: new Map([...players.keys()].map((id) => [id, { sleeperId: id, gsisId: id, pfrId: id, resolvedVia: "demo" }])),
    mappingIssues: [],
    seasonData: { season: SEASON, schedule, statWeeks, snapWeeks, teamTotals: totals, retrievedAt },
    previousSeasonData: null,
    prospects: { draft: new Map(), combine: new Map() },
    market: {
      provider: "demo",
      providerLabel: "Synthetic demo values",
      variantKey: "demo",
      format: "sf_dynasty",
      valuedAt: retrievedAt,
      retrievedAt,
      sourceUrl: "",
      attribution: null,
      values,
      picks,
      approximations: ["Synthetic values for demonstration only."],
    },
    marketHistory: new Map(),
    importedEvidence: [],
    config,
    sources: [
      { id: "demo", label: "Synthetic demo data", state: "partial", detail: "All players, stats, and values are generated. Nothing here is NFL evidence.", dataCutoff: null, retrievedAt, sourceUrl: null },
    ],
    connectedUserId: null,
  };
}

function syntheticLine(position: string, usage: number, random: () => number): Record<string, number | null> {
  const r = () => random();
  const base: Record<string, number | null> = {};
  if (position === "QB") {
    const attempts = Math.round(22 + usage * 18);
    Object.assign(base, {
      attempts,
      completions: Math.round(attempts * (0.58 + r() * 0.12)),
      passing_yards: Math.round(attempts * (6 + usage * 2.5)),
      passing_tds: Math.round(usage * 2.5 * r() + r()),
      passing_interceptions: r() < 0.35 ? 1 : 0,
      carries: Math.round(2 + usage * 5 * r()),
      rushing_yards: Math.round(usage * 30 * r()),
      passing_epa: Math.round((usage - 0.45) * 12 * 10) / 10,
      sacks_suffered: Math.round(r() * 3),
    });
  } else if (position === "RB") {
    const carries = Math.round(4 + usage * 16);
    const targets = Math.round(1 + usage * 4);
    Object.assign(base, {
      carries,
      rushing_yards: Math.round(carries * (3.6 + r() * 1.4)),
      rushing_tds: r() < usage * 0.6 ? 1 : 0,
      targets,
      receptions: Math.round(targets * 0.78),
      receiving_yards: Math.round(targets * 6),
      receiving_air_yards: targets,
      receiving_yards_after_catch: Math.round(targets * 5),
    });
  } else {
    const targets = Math.round(2 + usage * (position === "TE" ? 6 : 9));
    const receptions = Math.round(targets * (0.6 + r() * 0.12));
    Object.assign(base, {
      targets,
      receptions,
      receiving_yards: Math.round(receptions * (9 + r() * 5)),
      receiving_tds: r() < usage * 0.45 ? 1 : 0,
      receiving_air_yards: Math.round(targets * (position === "TE" ? 7 : 10)),
      receiving_yards_after_catch: Math.round(receptions * 4.5),
    });
  }
  return base;
}
