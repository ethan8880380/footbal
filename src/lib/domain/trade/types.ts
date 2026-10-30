import type { LeagueFormat } from "../league-format";
import type { PickAsset } from "../picks";
import type { EvidenceStrength } from "../recommendations";
import type { MarketSnapshot, Strategy } from "../types";

export interface TradeTeam {
  rosterId: string;
  name: string;
  playerIds: string[];
  reserve: string[];
  taxi: string[];
  isUnowned?: boolean;
  strategy: Strategy;
  strategySource: "manual" | "estimate";
  strategyEvidence: string[];
}

export interface TradePlayer {
  playerId: string;
  name: string;
  position: string | null;
  positions: string[];
  age: number | null;
  evidenceStrength: EvidenceStrength | null;
  injuryStatus: string | null;
}

export interface TradeContext {
  format: LeagueFormat;
  market: MarketSnapshot | null;
  picksByKey: Map<string, PickAsset>;
  teams: Map<string, TradeTeam>;
  players: Map<string, TradePlayer>;
  exponent: number;
}

export interface TradeProposal {
  sideA: { rosterId: string; gives: string[] };
  sideB: { rosterId: string; gives: string[] };
}

export type TradeIssueCode =
  | "same_team"
  | "unknown_team"
  | "empty_side"
  | "duplicate_asset"
  | "asset_on_both_sides"
  | "not_owned"
  | "unknown_asset";

export interface TradeIssue {
  code: TradeIssueCode;
  message: string;
  assetKey: string | null;
}
