import { replaceIdentities, replacePlayers, listIdentitySources, type PlayerRow } from "@/lib/db/repositories/player-repository";
import { replaceProspects, replaceSchedule, replaceSeasonStats } from "@/lib/db/repositories/stats-repository";
import { resolveIdentities } from "@/lib/domain/identity";
import type { TeamGameTotals } from "@/lib/domain/types";
import {
  NFLVERSE_URLS,
  fetchCombine,
  fetchCrosswalk,
  fetchDraftPicks,
  fetchNflversePlayers,
  fetchSchedule,
  fetchSnapCounts,
  fetchWeeklyStats,
} from "@/lib/providers/nflverse/nflverse-client";
import { SLEEPER_API, sleeperClient } from "@/lib/providers/sleeper/sleeper-client";
import { REFRESH_INTERVALS, isFresh, runStep } from "./freshness";

const RELEVANT_POSITIONS = new Set(["QB", "RB", "WR", "TE", "K", "FB", "DL", "DE", "DT", "NT", "LB", "OLB", "ILB", "MLB", "DB", "CB", "S", "SS", "FS"]);

export async function syncSleeperPlayers(force = false) {
  if (!force && (await isFresh("sleeper-players", "nfl", REFRESH_INTERVALS.sleeperPlayers))) {
    return { scope: "sleeper-players", key: "nfl", status: "skipped" as const, message: null };
  }
  return runStep("sleeper-players", "nfl", async () => {
    const directory = await sleeperClient.getPlayers();
    const retrievedAt = new Date().toISOString();
    const rows: PlayerRow[] = [];
    for (const [playerId, p] of directory) {
      rows.push({
        playerId,
        fullName: p.full_name ?? ([p.first_name, p.last_name].filter(Boolean).join(" ") || null),
        firstName: p.first_name ?? null,
        lastName: p.last_name ?? null,
        position: p.position ?? null,
        fantasyPositions: p.fantasy_positions ?? [],
        team: p.team ?? null,
        age: p.age ?? null,
        birthDate: p.birth_date ?? null,
        yearsExp: p.years_exp ?? null,
        rookieYear: typeof p.metadata?.rookie_year === "string" ? p.metadata.rookie_year : null,
        college: p.college ?? null,
        status: p.status ?? null,
        injuryStatus: p.injury_status ?? null,
        injuryBodyPart: p.injury_body_part ?? null,
        injuryStartDate: p.injury_start_date ?? null,
        injuryNotes: p.injury_notes ?? null,
        practiceParticipation: p.practice_participation ?? null,
        depthChartPosition: p.depth_chart_position ?? null,
        depthChartOrder: p.depth_chart_order ?? null,
        newsUpdated: p.news_updated ?? null,
        gsisId: p.gsis_id?.trim() || null,
        sportradarId: p.sportradar_id ?? null,
        retrievedAt,
      });
    }
    await replacePlayers(rows);
    return { rowCount: rows.length, sourceUrl: `${SLEEPER_API}/players/nfl`, dataCutoff: retrievedAt };
  });
}

export async function syncIdentity(rosteredIds: Set<string>, force = false) {
  if (!force && (await isFresh("identity", "crosswalk", REFRESH_INTERVALS.identity))) {
    return { scope: "identity", key: "crosswalk", status: "skipped" as const, message: null };
  }
  return runStep("identity", "crosswalk", async () => {
    const [crosswalk, nflversePlayers, sources] = await Promise.all([fetchCrosswalk(), fetchNflversePlayers(), listIdentitySources()]);
    const relevant = sources.filter((s) => rosteredIds.has(s.playerId) || (s.position && RELEVANT_POSITIONS.has(s.position)));
    const { identities, issues } = resolveIdentities(relevant, crosswalk, nflversePlayers, rosteredIds);
    await replaceIdentities(identities, issues);
    const resolved = identities.filter((i) => i.gsisId).length;
    return {
      rowCount: resolved,
      message: `${resolved} of ${identities.length} players resolved; ${issues.length} mapping issues.`,
      sourceUrl: NFLVERSE_URLS.crosswalk,
      status: "success",
    };
  });
}

/**
 * Ingests the newest season with published regular-season rows. Coverage is
 * verified from the data itself rather than assumed from the calendar.
 */
export async function syncStats(candidateSeasons: number[], force = false) {
  const results = [];
  for (const season of candidateSeasons) {
    if (!force && (await isFresh("stats", String(season), REFRESH_INTERVALS.stats))) {
      results.push({ scope: "stats", key: String(season), status: "skipped" as const, message: null });
      continue;
    }
    results.push(
      await runStep("stats", String(season), async () => {
        const [stats, snaps] = await Promise.all([fetchWeeklyStats(season), fetchSnapCounts(season)]);
        if (!stats || !stats.some((r) => r.seasonType === "REG")) {
          return { status: "unavailable", message: `No ${season} regular-season stats are published yet.`, sourceUrl: NFLVERSE_URLS.stats(season) };
        }
        const totals = computeTeamTotals(stats, snaps ?? []);
        await replaceSeasonStats(
          season,
          stats,
          (snaps ?? []).map((s) => ({ ...s })),
          totals,
        );
        const maxWeek = Math.max(...stats.filter((r) => r.seasonType === "REG").map((r) => r.week));
        return {
          rowCount: stats.length,
          dataCutoff: `Week ${maxWeek}`,
          sourceUrl: NFLVERSE_URLS.stats(season),
          status: snaps ? "success" : "partial",
          message: snaps ? `${stats.length} player-weeks; snap counts through the same games.` : "Snap counts not yet published for this season.",
        };
      }),
    );
  }
  results.push(
    await runStep("schedule", "nflverse", async () => {
      const games = await fetchSchedule(candidateSeasons);
      await replaceSchedule(candidateSeasons, games);
      const upcoming = games.filter((g) => g.homeScore === null);
      const lined = upcoming.filter((g) => g.spreadLine !== null && g.totalLine !== null).length;
      return { rowCount: games.length, sourceUrl: NFLVERSE_URLS.schedule, message: `${games.length} games; Vegas lines on ${lined} of ${upcoming.length} upcoming.` };
    }),
  );
  return results;
}

export function computeTeamTotals(
  stats: { gameId: string | null; team: string; season: number; week: number; seasonType: string; stats: Record<string, number | null> }[],
  snaps: { gameId: string; team: string; offenseSnaps: number | null; defenseSnaps: number | null }[],
): TeamGameTotals[] {
  const totals = new Map<string, TeamGameTotals>();
  for (const row of stats) {
    if (!row.gameId) continue;
    const key = `${row.gameId}|${row.team}`;
    const entry = totals.get(key) ?? {
      gameId: row.gameId,
      season: row.season,
      week: row.week,
      team: row.team,
      targets: 0,
      carries: 0,
      airYards: 0,
      passAttempts: 0,
      offenseSnaps: null,
      defenseSnaps: null,
      hasSnapCoverage: false,
    };
    entry.targets += row.stats.targets ?? 0;
    entry.carries += row.stats.carries ?? 0;
    entry.airYards += row.stats.receiving_air_yards ?? 0;
    entry.passAttempts += row.stats.attempts ?? 0;
    totals.set(key, entry);
  }
  for (const snap of snaps) {
    const entry = totals.get(`${snap.gameId}|${snap.team}`);
    if (!entry) continue;
    entry.hasSnapCoverage = true;
    // Team snaps: the highest single-player snap count in that game (a full-time QB or lineman plays every snap).
    entry.offenseSnaps = Math.max(entry.offenseSnaps ?? 0, snap.offenseSnaps ?? 0);
    entry.defenseSnaps = Math.max(entry.defenseSnaps ?? 0, snap.defenseSnaps ?? 0);
  }
  return [...totals.values()];
}

export async function syncProspects(force = false) {
  if (!force && (await isFresh("prospects", "nflverse", REFRESH_INTERVALS.prospects))) {
    return { scope: "prospects", key: "nflverse", status: "skipped" as const, message: null };
  }
  return runStep("prospects", "nflverse", async () => {
    const minSeason = new Date().getFullYear() - 16;
    const [draft, combine] = await Promise.all([fetchDraftPicks(minSeason), fetchCombine(minSeason)]);
    await replaceProspects(draft, combine);
    return { rowCount: draft.length + combine.length, sourceUrl: NFLVERSE_URLS.draftPicks, message: `${draft.length} draft picks, ${combine.length} combine records.` };
  });
}
