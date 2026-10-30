export const STRATEGIES = {
  contending: "Contending",
  balanced: "Balanced / retooling",
  rebuilding: "Rebuilding",
} as const;
export type Strategy = keyof typeof STRATEGIES;

export const RECOMMENDATIONS = {
  keep: "Keep",
  shop: "Shop",
  monitor: "Monitor",
  insufficient: "Insufficient evidence",
} as const;
export type Recommendation = keyof typeof RECOMMENDATIONS;

export type EvidenceKind = "observed" | "calculated" | "projected" | "manual";

export interface Evidence {
  id: string;
  playerId: string | null;
  metricKey: string;
  label: string;
  value: number | string | null;
  units: string;
  provider: string;
  sourceUrl: string | null;
  season: number | null;
  weekStart: number | null;
  weekEnd: number | null;
  dateRange: string | null;
  sampleSize: number | null;
  sampleUnit: string | null;
  definition: string;
  denominator: string | null;
  dataCutoff: string | null;
  retrievedAt: string | null;
  kind: EvidenceKind;
}

export interface PlayerRecord {
  playerId: string;
  fullName: string | null;
  position: string | null;
  fantasyPositions: string[];
  team: string | null;
  age: number | null;
  birthDate: string | null;
  yearsExp: number | null;
  rookieYear: string | null;
  college: string | null;
  status: string | null;
  injuryStatus: string | null;
  injuryBodyPart: string | null;
  injuryStartDate: string | null;
  injuryNotes: string | null;
  practiceParticipation: string | null;
  depthChartPosition: string | null;
  depthChartOrder: number | null;
  newsUpdated: number | null;
  retrievedAt: string;
}

export interface RosterRecord {
  rosterId: string;
  ownerId: string | null;
  coOwners: string[];
  players: string[];
  starters: string[];
  reserve: string[];
  taxi: string[];
  settings: Record<string, unknown>;
}

export interface MemberRecord {
  userId: string;
  displayName: string | null;
  teamName: string | null;
  avatar: string | null;
}

export interface LeagueRecord {
  leagueId: string;
  name: string;
  season: string;
  status: string | null;
  totalRosters: number | null;
  settings: Record<string, unknown>;
  scoringSettings: Record<string, number>;
  rosterPositions: string[];
  avatar: string | null;
  retrievedAt: string;
}

export interface DraftRecord {
  draftId: string;
  season: string;
  status: string;
  rounds: number | null;
  slotToRosterId: Record<string, string> | null;
}

export interface TradedPickRecord {
  season: string;
  round: number;
  originalRosterId: string;
  ownerRosterId: string;
  previousOwnerRosterId: string | null;
}

export interface IdentityRecord {
  sleeperId: string;
  gsisId: string | null;
  pfrId: string | null;
  resolvedVia: string;
}

export interface MappingIssue {
  sleeperId: string;
  kind: string;
  detail: string;
}

export type StatLine = Record<string, number | null>;

export interface StatWeekRecord {
  season: number;
  week: number;
  seasonType: string;
  gsisId: string;
  gameId: string | null;
  team: string;
  stats: StatLine;
}

export interface SnapWeekRecord {
  gameId: string;
  pfrId: string;
  season: number;
  week: number;
  team: string;
  offenseSnaps: number | null;
  defenseSnaps: number | null;
  stSnaps: number | null;
}

export interface TeamGameTotals {
  gameId: string;
  season: number;
  week: number;
  team: string;
  targets: number;
  carries: number;
  airYards: number;
  passAttempts: number;
  offenseSnaps: number | null;
  defenseSnaps: number | null;
  hasSnapCoverage: boolean;
}

export interface ScheduleGame {
  gameId: string;
  season: number;
  week: number;
  gameType: string;
  gameday: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
}

export interface DraftProspectRecord {
  pfrId: string;
  season: number;
  round: number;
  pick: number;
  team: string | null;
  college: string | null;
}

export interface CombineRecord {
  pfrId: string;
  season: number;
  height: string | null;
  weight: number | null;
  forty: number | null;
  bench: number | null;
  vertical: number | null;
  broadJump: number | null;
  cone: number | null;
  shuttle: number | null;
}

export interface MarketValueRecord {
  playerId: string;
  value: number | null;
  rank: number | null;
  positionRank: number | null;
  change7d: number | null;
  change30d: number | null;
  url: string | null;
}

export interface MarketPickRecord {
  pickId: string;
  year: number;
  round: number;
  slot: number | null;
  variant: string | null;
  value: number | null;
}

export interface MarketSnapshot {
  provider: string;
  providerLabel: string;
  variantKey: string;
  format: string;
  valuedAt: string | null;
  retrievedAt: string | null;
  sourceUrl: string;
  attribution: { label: string; url: string } | null;
  values: Map<string, MarketValueRecord>;
  picks: Map<string, MarketPickRecord>;
  approximations: string[];
}

export interface ValueHistoryPoint {
  date: string;
  value: number | null;
  origin: "provider" | "local";
}

export interface PickBudget {
  maxPicks: number;
  allowFirsts: boolean;
}

export interface LeagueConfig {
  leagueId: string;
  myRosterId: string | null;
  strategy: Strategy;
  targetPositions: string[];
  pickBudget: PickBudget;
  consolidationExponent: number;
  draftOrderRules: string | null;
  manualDraftSlots: Record<string, number>;
  confirmedPickSeasons: string[];
  opponentStrategies: Record<string, Strategy>;
  flags: Map<string, AssetFlag>;
}

export type AssetFlag = "protected" | "available";

export interface SourceStatus {
  id: string;
  label: string;
  state: "fresh" | "stale" | "unavailable" | "error" | "partial";
  detail: string;
  dataCutoff: string | null;
  retrievedAt: string | null;
  sourceUrl: string | null;
}
