import type { LeagueModel } from "@/lib/analysis/league-model";
import type { Recommendation, Strategy } from "@/lib/domain/types";
import { pickRows, type PickRow } from "./roster-view";

const OFFENSE = ["QB", "RB", "WR", "TE"];
const IDP = ["DL", "LB", "DB"];

export type Tier = "elite" | "solid" | "thin" | "weak";

export interface BoardPlayer {
  playerId: string;
  name: string;
  overallRank: number | null;
  positionRank: number | null;
  value: number | null;
  recommendation: Recommendation;
  injury: string | null;
  isStarter: boolean;
}

export interface PositionGroup {
  position: string;
  rank: number | null;
  total: number;
  players: BoardPlayer[];
}

export interface TeamBoard {
  groups: PositionGroup[];
  picks: PickRow[];
  totalValue: number;
  valueRank: number;
  lineupRank: number;
  teams: number;
}

export interface LeagueRow {
  rosterId: string;
  name: string;
  isMine: boolean;
  strategy: Strategy;
  totalValue: number;
  valueRank: number;
  lineupRank: number;
  positionRanks: Record<string, number | null>;
}

export function boardPositions(model: LeagueModel) {
  return model.format.isIdp ? [...OFFENSE, ...IDP] : OFFENSE;
}

/** Positional rank against the league: an RB12 in a 12-team league is still starter-grade. */
export function playerTier(positionRank: number | null, teams: number): Tier | null {
  if (positionRank === null) return null;
  if (positionRank <= teams) return "elite";
  if (positionRank <= teams * 2) return "solid";
  if (positionRank <= teams * 3) return "thin";
  return "weak";
}

/** Team rank in thirds-ish: top quarter elite, bottom third weak. */
export function teamTier(rank: number | null, teams: number): Tier | null {
  if (rank === null) return null;
  const share = rank / Math.max(1, teams);
  if (share <= 0.25) return "elite";
  if (share <= 0.5) return "solid";
  if (share <= 2 / 3) return "thin";
  return "weak";
}

export function teamBoard(model: LeagueModel, rosterId: string): TeamBoard | null {
  const team = model.teamsById.get(rosterId);
  if (!team) return null;
  const totals = positionTotals(model);
  const groups = boardPositions(model).map((position) => {
    const players = team.roster.players
      .map((id) => model.players.get(id))
      .filter((p) => p?.position === position)
      .map((p) => ({
        playerId: p!.playerId,
        name: p!.name,
        overallRank: p!.market?.rank ?? null,
        positionRank: p!.market?.positionRank ?? null,
        value: p!.market?.value ?? null,
        recommendation: p!.recommendation.recommendation,
        injury: p!.player?.injuryStatus ?? null,
        isStarter: p!.isOwnerStarter,
      }))
      .sort((a, b) => (a.positionRank ?? Infinity) - (b.positionRank ?? Infinity) || (b.value ?? 0) - (a.value ?? 0));
    return { position, rank: rankAmong(totals, rosterId, position), total: totals.get(rosterId)?.get(position) ?? 0, players };
  });
  return {
    groups,
    picks: pickRows(model, rosterId),
    totalValue: team.totalValue,
    valueRank: rankBy(model, rosterId, (t) => t.totalValue),
    lineupRank: rankBy(model, rosterId, (t) => t.starterValue),
    teams: model.teams.length,
  };
}

export function leagueBoard(model: LeagueModel): LeagueRow[] {
  const totals = positionTotals(model);
  const positions = boardPositions(model);
  return model.teams
    .map((team) => ({
      rosterId: team.rosterId,
      name: team.name,
      isMine: team.rosterId === model.myTeam?.rosterId,
      strategy: team.strategy,
      totalValue: team.totalValue,
      valueRank: rankBy(model, team.rosterId, (t) => t.totalValue),
      lineupRank: rankBy(model, team.rosterId, (t) => t.starterValue),
      positionRanks: Object.fromEntries(positions.map((p) => [p, rankAmong(totals, team.rosterId, p)])),
    }))
    .sort((a, b) => a.valueRank - b.valueRank);
}

function positionTotals(model: LeagueModel) {
  const totals = new Map<string, Map<string, number>>();
  for (const team of model.teams) {
    const byPosition = new Map<string, number>();
    for (const id of team.roster.players) {
      const player = model.players.get(id);
      if (!player?.position) continue;
      byPosition.set(player.position, (byPosition.get(player.position) ?? 0) + (player.market?.value ?? 0));
    }
    totals.set(team.rosterId, byPosition);
  }
  return totals;
}

function rankAmong(totals: Map<string, Map<string, number>>, rosterId: string, position: string) {
  const mine = totals.get(rosterId)?.get(position) ?? 0;
  if (mine <= 0) return null;
  return 1 + [...totals.values()].filter((t) => (t.get(position) ?? 0) > mine).length;
}

function rankBy(model: LeagueModel, rosterId: string, value: (t: LeagueModel["teams"][number]) => number) {
  const team = model.teamsById.get(rosterId);
  if (!team) return model.teams.length;
  return 1 + model.teams.filter((t) => value(t) > value(team)).length;
}
