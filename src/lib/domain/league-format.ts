import { NON_STARTING_SLOTS, SLOT_LABELS, isIdpSlot } from "./positions";
import type { LeagueRecord } from "./types";

export type LeagueType = "redraft" | "keeper" | "dynasty" | "unknown";

export interface LeagueFormat {
  leagueType: LeagueType;
  teams: number;
  starterSlots: string[];
  benchSlots: number;
  reserveSlots: number;
  taxiSlots: number;
  activeRosterLimit: number;
  qbStarterSlots: number;
  isSuperflex: boolean;
  isIdp: boolean;
  idpStarterSlots: number;
  tightEndStarterSlots: number;
  receptionPoints: number;
  tePremium: number;
  scoringLabel: string;
  draftRounds: number | null;
}

const LEAGUE_TYPES: Record<number, LeagueType> = { 0: "redraft", 1: "keeper", 2: "dynasty" };

export function analyzeLeagueFormat(league: Pick<LeagueRecord, "settings" | "scoringSettings" | "rosterPositions" | "totalRosters">): LeagueFormat {
  const positions = league.rosterPositions;
  const starterSlots = positions.filter((slot) => !NON_STARTING_SLOTS.has(slot));
  const settings = league.settings;
  const scoring = league.scoringSettings;
  const qbStarterSlots = starterSlots.filter((s) => s === "QB").length;
  const superflexSlots = starterSlots.filter((s) => s === "SUPER_FLEX").length;
  const idpStarterSlots = starterSlots.filter(isIdpSlot).length;
  const receptionPoints = scoring.rec ?? 0;
  const tePremium = scoring.bonus_rec_te ?? 0;

  return {
    leagueType: LEAGUE_TYPES[Number(settings.type)] ?? "unknown",
    teams: league.totalRosters ?? Number(settings.num_teams ?? 0),
    starterSlots,
    benchSlots: positions.filter((s) => s === "BN").length,
    reserveSlots: numberSetting(settings.reserve_slots),
    taxiSlots: numberSetting(settings.taxi_slots),
    activeRosterLimit: positions.filter((s) => s !== "IR" && s !== "TAXI").length,
    qbStarterSlots,
    isSuperflex: superflexSlots > 0 || qbStarterSlots >= 2,
    isIdp: idpStarterSlots > 0,
    idpStarterSlots,
    tightEndStarterSlots: starterSlots.filter((s) => s === "TE").length,
    receptionPoints,
    tePremium,
    scoringLabel: scoringLabel(receptionPoints, tePremium),
    draftRounds: settings.draft_rounds == null ? null : Number(settings.draft_rounds),
  };
}

function scoringLabel(rec: number, tePremium: number) {
  const base = rec === 1 ? "PPR" : rec === 0.5 ? "Half PPR" : rec === 0 ? "Standard" : `${rec} PPR`;
  return tePremium > 0 ? `${base}, TE +${tePremium}` : base;
}

function numberSetting(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function describeLineup(format: LeagueFormat) {
  const counts = new Map<string, number>();
  for (const slot of format.starterSlots) counts.set(slot, (counts.get(slot) ?? 0) + 1);
  return [...counts.entries()]
    .map(([slot, count]) => {
      const label = SLOT_LABELS[slot] ?? slot;
      return count > 1 ? `${count} ${label}` : label;
    })
    .join(", ");
}
