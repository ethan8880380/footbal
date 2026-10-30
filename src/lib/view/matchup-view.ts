import type { LeagueModel } from "@/lib/analysis/league-model";
import { NON_STARTING_SLOTS, SLOT_SHORT_LABELS } from "@/lib/domain/positions";
import type { SleeperMatchup } from "@/lib/providers/sleeper/schemas";

export const MATCHUP_WEEKS = 18;

export interface MatchupPlayer {
  playerId: string;
  name: string;
  position: string | null;
  team: string | null;
  injury: string | null;
  points: number;
}

export interface MatchupSide {
  rosterId: string;
  name: string;
  record: string;
  points: number;
  isMine: boolean;
  starters: (MatchupPlayer | null)[];
  bench: MatchupPlayer[];
}

export interface MatchupView {
  slots: string[];
  home: MatchupSide;
  away: MatchupSide | null;
}

export interface MatchupTeamOption {
  rosterId: string;
  name: string;
}

export function matchupTeams(model: LeagueModel): MatchupTeamOption[] {
  return model.teams.filter((t) => !t.isUnowned).map((t) => ({ rosterId: t.rosterId, name: t.name }));
}

export interface ScoreTeam {
  rosterId: string;
  name: string;
  points: number;
  isMine: boolean;
}

export interface WeekScore {
  matchupId: number;
  teams: [ScoreTeam, ScoreTeam | null];
}

/** Every head-to-head game of the week, the viewer's game first. */
export function buildWeekScores(model: LeagueModel, matchups: SleeperMatchup[]): WeekScore[] {
  const games = new Map<number, ScoreTeam[]>();
  for (const entry of matchups) {
    if (entry.matchup_id == null) continue;
    const team: ScoreTeam = {
      rosterId: entry.roster_id,
      name: model.teamsById.get(entry.roster_id)?.name ?? `Roster ${entry.roster_id}`,
      points: entry.points,
      isMine: model.myTeam?.rosterId === entry.roster_id,
    };
    games.set(entry.matchup_id, [...(games.get(entry.matchup_id) ?? []), team]);
  }
  return [...games.entries()]
    .map(([matchupId, teams]) => ({ matchupId, teams: [teams[0], teams[1] ?? null] as WeekScore["teams"] }))
    .sort((a, b) => Number(b.teams.some((t) => t?.isMine)) - Number(a.teams.some((t) => t?.isMine)) || a.matchupId - b.matchupId);
}

export interface StandingRow {
  rosterId: string;
  name: string;
  record: string;
  pointsFor: number;
  isMine: boolean;
}

/** Sleeper's standings order: wins, then ties, then points for. */
export function buildStandings(model: LeagueModel): StandingRow[] {
  return model.teams
    .filter((t) => !t.isUnowned)
    .map((t) => {
      const s = t.roster.settings;
      const wins = Number(s.wins ?? 0);
      const losses = Number(s.losses ?? 0);
      const ties = Number(s.ties ?? 0);
      return {
        rosterId: t.rosterId,
        name: t.name,
        wins,
        ties,
        record: ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`,
        pointsFor: Number(s.fpts ?? 0) + Number(s.fpts_decimal ?? 0) / 100,
        isMine: model.myTeam?.rosterId === t.rosterId,
      };
    })
    .sort((a, b) => b.wins - a.wins || b.ties - a.ties || b.pointsFor - a.pointsFor)
    .map(({ wins: _wins, ties: _ties, ...row }) => row);
}

export function clampWeek(week: number) {
  return Math.min(MATCHUP_WEEKS, Math.max(1, Math.trunc(week) || 1));
}

/** Pairs a roster with its opponent for the week; returns null when the roster has no entry. */
export function buildMatchupView(model: LeagueModel, matchups: SleeperMatchup[], rosterId: string): MatchupView | null {
  const mine = matchups.find((m) => m.roster_id === rosterId);
  if (!mine) return null;
  const opponent = mine.matchup_id == null ? null : matchups.find((m) => m.matchup_id === mine.matchup_id && m.roster_id !== rosterId) ?? null;
  const slots = model.dataset.league.rosterPositions.filter((p) => !NON_STARTING_SLOTS.has(p)).map((p) => SLOT_SHORT_LABELS[p] ?? p);

  const side = (entry: SleeperMatchup): MatchupSide => {
    const team = model.teamsById.get(entry.roster_id);
    const wins = Number(team?.roster.settings.wins ?? 0);
    const losses = Number(team?.roster.settings.losses ?? 0);
    const ties = Number(team?.roster.settings.ties ?? 0);
    const player = (playerId: string, points: number): MatchupPlayer => {
      const info = model.players.get(playerId);
      return {
        playerId,
        name: info?.name ?? (/^\d+$/.test(playerId) ? `Player ${playerId}` : playerId),
        position: info?.position ?? null,
        team: info?.team ?? null,
        injury: info?.player?.injuryStatus ?? null,
        points,
      };
    };
    const starters = entry.starters.map((id, i) => (id === "0" ? null : player(id, entry.starters_points[i] ?? 0)));
    const excluded = new Set([...entry.starters, ...(team?.roster.reserve ?? []), ...(team?.roster.taxi ?? [])]);
    const bench = entry.players.filter((id) => !excluded.has(id)).map((id) => player(id, entry.players_points[id] ?? 0)).sort((a, b) => b.points - a.points);
    return {
      rosterId: entry.roster_id,
      name: team?.name ?? `Roster ${entry.roster_id}`,
      record: ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`,
      points: entry.points,
      isMine: model.myTeam?.rosterId === entry.roster_id,
      starters,
      bench,
    };
  };

  return { slots, home: side(mine), away: opponent ? side(opponent) : null };
}
