import { HttpError, fetchText } from "@/lib/http/fetch-with-retry";
import { REQUIRED_STAT_COLUMNS } from "@/lib/domain/scoring";
import { NFLVERSE_SNAPS_URL, NFLVERSE_STATS_URL } from "@/lib/domain/metrics";
import type { ScheduleGame, SnapWeekRecord, StatLine, StatWeekRecord } from "@/lib/domain/types";
import { num, parseCsv, str } from "../csv";

const RELEASES = "https://github.com/nflverse/nflverse-data/releases/download";
export const NFLVERSE_URLS = {
  stats: NFLVERSE_STATS_URL,
  snaps: NFLVERSE_SNAPS_URL,
  schedule: `${RELEASES}/schedules/games.csv`,
  players: `${RELEASES}/players/players.csv`,
  draftPicks: `${RELEASES}/draft_picks/draft_picks.csv`,
  combine: `${RELEASES}/combine/combine.csv`,
  crosswalk: "https://github.com/dynastyprocess/data/raw/master/files/db_playerids.csv",
  docs: "https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html",
};

async function downloadCsv(url: string) {
  return parseCsv(await fetchText(url, { timeoutMs: 180_000 }));
}

/** Returns null when the season file has not been published yet. */
export async function fetchWeeklyStats(season: number): Promise<StatWeekRecord[] | null> {
  let rows: Record<string, string>[];
  try {
    rows = await downloadCsv(NFLVERSE_URLS.stats(season));
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
  return rows.flatMap((row) => {
    const gsisId = str(row.player_id);
    const week = num(row.week);
    const team = str(row.team);
    if (!gsisId || week === null || !team) return [];
    const stats: StatLine = {};
    for (const column of REQUIRED_STAT_COLUMNS) stats[column] = num(row[column]);
    return [{
      season,
      week,
      seasonType: str(row.season_type) ?? "REG",
      gsisId,
      gameId: str(row.game_id),
      team,
      opponent: str(row.opponent_team),
      position: str(row.position),
      stats,
    }];
  });
}

export async function fetchSnapCounts(season: number): Promise<(SnapWeekRecord & { gameType: string; position: string | null; offensePct: number | null; defensePct: number | null })[] | null> {
  let rows: Record<string, string>[];
  try {
    rows = await downloadCsv(NFLVERSE_URLS.snaps(season));
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
  return rows.flatMap((row) => {
    const gameId = str(row.game_id);
    const pfrId = str(row.pfr_player_id);
    const week = num(row.week);
    const team = str(row.team);
    if (!gameId || !pfrId || week === null || !team) return [];
    return [{
      gameId,
      pfrId,
      season,
      week,
      gameType: str(row.game_type) ?? "REG",
      team,
      position: str(row.position),
      offenseSnaps: num(row.offense_snaps),
      offensePct: num(row.offense_pct),
      defenseSnaps: num(row.defense_snaps),
      defensePct: num(row.defense_pct),
      stSnaps: num(row.st_snaps),
    }];
  });
}

export async function fetchSchedule(seasons: number[]): Promise<ScheduleGame[]> {
  const rows = await downloadCsv(NFLVERSE_URLS.schedule);
  const wanted = new Set(seasons);
  return rows.flatMap((row) => {
    const season = num(row.season);
    const week = num(row.week);
    const gameId = str(row.game_id);
    const home = str(row.home_team);
    const away = str(row.away_team);
    if (season === null || !wanted.has(season) || week === null || !gameId || !home || !away) return [];
    return [{
      gameId,
      season,
      week,
      gameType: str(row.game_type) ?? "REG",
      gameday: str(row.gameday),
      gametime: str(row.gametime),
      homeTeam: home,
      awayTeam: away,
      homeScore: num(row.home_score),
      awayScore: num(row.away_score),
      spreadLine: num(row.spread_line),
      totalLine: num(row.total_line),
    }];
  });
}

export interface CrosswalkRow {
  sleeperId: string | null;
  gsisId: string | null;
  pfrId: string | null;
  sportradarId: string | null;
}

export async function fetchCrosswalk(): Promise<CrosswalkRow[]> {
  const rows = await downloadCsv(NFLVERSE_URLS.crosswalk);
  return rows.map((row) => ({
    sleeperId: str(row.sleeper_id),
    gsisId: str(row.gsis_id),
    pfrId: str(row.pfr_id),
    sportradarId: str(row.sportradar_id),
  }));
}

export interface NflversePlayerRow {
  gsisId: string;
  pfrId: string | null;
}

export async function fetchNflversePlayers(): Promise<NflversePlayerRow[]> {
  const rows = await downloadCsv(NFLVERSE_URLS.players);
  return rows.flatMap((row) => {
    const gsisId = str(row.gsis_id);
    return gsisId ? [{ gsisId, pfrId: str(row.pfr_id) }] : [];
  });
}

export async function fetchDraftPicks(minSeason: number) {
  const rows = await downloadCsv(NFLVERSE_URLS.draftPicks);
  return rows.flatMap((row) => {
    const pfrId = str(row.pfr_player_id);
    const season = num(row.season);
    const round = num(row.round);
    const pick = num(row.pick);
    if (!pfrId || season === null || season < minSeason || round === null || pick === null) return [];
    return [{ pfrId, gsisId: str(row.gsis_id), season, round, pick, team: str(row.team), college: str(row.college), position: str(row.position) }];
  });
}

export async function fetchCombine(minSeason: number) {
  const rows = await downloadCsv(NFLVERSE_URLS.combine);
  return rows.flatMap((row) => {
    const pfrId = str(row.pfr_id);
    const season = num(row.season);
    if (!pfrId || season === null || season < minSeason) return [];
    return [{
      pfrId,
      season,
      position: str(row.pos),
      school: str(row.school),
      height: str(row.ht),
      weight: num(row.wt),
      forty: num(row.forty),
      bench: num(row.bench),
      vertical: num(row.vertical),
      broadJump: num(row.broad_jump),
      cone: num(row.cone),
      shuttle: num(row.shuttle),
    }];
  });
}
