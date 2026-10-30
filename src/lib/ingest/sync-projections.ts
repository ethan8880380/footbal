import { listNflTeamPlayers } from "@/lib/db/repositories/player-repository";
import { replaceProjections, type ProjectionRow } from "@/lib/db/repositories/projection-repository";
import { getSeasonSchedule } from "@/lib/db/repositories/stats-repository";
import { propPlayerMatcher } from "@/lib/domain/player-props";
import { toNflverseTeam } from "@/lib/domain/teams";
import { sleeperClient, sleeperProjectionsUrl } from "@/lib/providers/sleeper/sleeper-client";
import { SPORTSGAMEODDS, fetchNflPlayerProps, sportsGameOddsKey } from "@/lib/providers/sportsgameodds/sportsgameodds-client";
import { REFRESH_INTERVALS, isFresh, runStep, type StepResult } from "./freshness";

const PROPS_LOOKBACK_MS = 6 * 60 * 60 * 1000;
const PROPS_LOOKAHEAD_MS = 8 * 24 * 60 * 60 * 1000;
/** The free tier refreshes every 10 minutes, so even a forced sync gains nothing sooner and only spends quota. */
const PROPS_MIN_INTERVAL_MS = 10 * 60 * 1000;

export async function syncProjections(season: number, weeks: number[], force = false): Promise<StepResult[]> {
  const results: StepResult[] = [];
  for (const week of weeks) {
    const key = `${season}-${week}`;
    if (!force && (await isFresh("projections", key, REFRESH_INTERVALS.projections))) {
      results.push({ scope: "projections", key, status: "skipped", message: null });
      continue;
    }
    results.push(
      await runStep("projections", key, async () => {
        const sourceUrl = sleeperProjectionsUrl(season, week);
        const rows = (await sleeperClient.getProjections(season, week)).filter((r) => (r.stats.gp ?? 0) > 0);
        if (rows.length === 0) return { status: "unavailable", message: `No week ${week} projections published yet.`, sourceUrl };
        await replaceProjections("sleeper", season, week, rows.map((r) => ({ playerId: r.player_id, stats: r.stats, lines: null })));
        return { rowCount: rows.length, dataCutoff: `Week ${week}`, sourceUrl, message: `${rows.length} players projected for week ${week}.` };
      }),
    );
  }
  return results;
}

export async function syncPlayerProps(season: number, force = false): Promise<StepResult> {
  const key = SPORTSGAMEODDS.id;
  const apiKey = sportsGameOddsKey();
  if (!apiKey) return { scope: "props", key, status: "skipped", message: "SPORTSGAMEODDS_API_KEY is not set." };
  if (await isFresh("props", key, force ? PROPS_MIN_INTERVAL_MS : REFRESH_INTERVALS.props)) return { scope: "props", key, status: "skipped", message: null };

  return runStep("props", key, async () => {
    const now = Date.now();
    const [events, schedule, directory] = await Promise.all([
      fetchNflPlayerProps(apiKey, { startsAfter: new Date(now - PROPS_LOOKBACK_MS), startsBefore: new Date(now + PROPS_LOOKAHEAD_MS) }),
      getSeasonSchedule(season),
      listNflTeamPlayers(),
    ]);
    const match = propPlayerMatcher(directory);
    const weekOf = new Map(schedule.filter((g) => g.gameType === "REG").map((g) => [`${g.awayTeam}@${g.homeTeam}`, g.week]));

    const byWeek = new Map<number, ProjectionRow[]>();
    const unmatched: string[] = [];
    let unscheduled = 0;
    for (const event of events) {
      const week = weekOf.get(`${toNflverseTeam(event.awayTeam)}@${toNflverseTeam(event.homeTeam)}`);
      if (week === undefined) {
        unscheduled++;
        continue;
      }
      const rows = byWeek.get(week) ?? [];
      for (const player of event.players) {
        const playerId = player.names.map((name) => match(name, player.team)).find(Boolean);
        if (playerId) rows.push({ playerId, stats: null, lines: player.lines });
        else unmatched.push(`${player.names[0]} (${player.team})`);
      }
      byWeek.set(week, rows);
    }
    for (const [week, rows] of byWeek) await replaceProjections("sportsgameodds", season, week, rows);

    const matched = [...byWeek.values()].reduce((total, rows) => total + rows.length, 0);
    const notes = [
      `${matched} players across ${events.length} games`,
      unmatched.length ? `${unmatched.length} unmatched (${unmatched.slice(0, 3).join(", ")}${unmatched.length > 3 ? ", …" : ""})` : null,
      unscheduled ? `${unscheduled} games not on the schedule` : null,
    ].filter(Boolean);
    return {
      rowCount: matched,
      status: events.length ? "success" : "unavailable",
      dataCutoff: [...byWeek.keys()].length ? `Week ${Math.max(...byWeek.keys())}` : null,
      sourceUrl: SPORTSGAMEODDS.docs,
      message: `${notes.join("; ")}.`,
    };
  });
}
