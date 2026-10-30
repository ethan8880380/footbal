import { solveLineup, type LineupResult } from "../lineup";
import { pickLabel } from "../picks";
import { STRATEGIES, type Strategy } from "../types";
import { parseAssetKey, valueSide, type SideValue } from "../valuation";
import type { TradeContext, TradeIssue, TradeProposal, TradeTeam } from "./types";
import { validateTrade } from "./validate";

export interface RosterCapacity {
  activeBefore: number;
  activeAfter: number;
  limit: number;
  requiredCuts: number;
  cutCandidates: string[];
}

export interface LineupChange {
  method: "market-value";
  before: LineupResult;
  after: LineupResult;
  entering: string[];
  leaving: string[];
  starterValueBefore: number;
  starterValueAfter: number;
}

export interface TimelineFit {
  strategy: Strategy;
  source: TradeTeam["strategySource"];
  fit: "good" | "neutral" | "poor";
  note: string;
}

export interface SideEvaluation {
  rosterId: string;
  name: string;
  gives: SideValue;
  receives: SideValue;
  netRaw: number | null;
  netAdjusted: number | null;
  capacity: RosterCapacity;
  lineup: LineupChange | null;
  depth: { position: string; before: number; after: number }[];
  timeline: TimelineFit;
}

export interface TradeEvaluation {
  issues: TradeIssue[];
  isValid: boolean;
  isScorable: boolean;
  missingInputs: string[];
  sides: [SideEvaluation, SideEvaluation] | null;
  valueGap: { raw: number; adjusted: number; share: number; label: string } | null;
  risks: string[];
  market: { provider: string; format: string; valuedAt: string | null } | null;
}

export function evaluateTrade(proposal: TradeProposal, ctx: TradeContext): TradeEvaluation {
  const issues = validateTrade(proposal, ctx);
  const market = ctx.market ? { provider: ctx.market.providerLabel, format: ctx.market.format, valuedAt: ctx.market.valuedAt } : null;
  if (issues.length > 0) {
    return { issues, isValid: false, isScorable: false, missingInputs: [], sides: null, valueGap: null, risks: [], market };
  }
  if (!ctx.market) {
    return {
      issues,
      isValid: true,
      isScorable: false,
      missingInputs: ["Market values are unavailable. Sync values or import a CSV in Settings."],
      sides: null,
      valueGap: null,
      risks: [],
      market,
    };
  }

  const teamA = ctx.teams.get(proposal.sideA.rosterId)!;
  const teamB = ctx.teams.get(proposal.sideB.rosterId)!;
  const aGives = valueSide(proposal.sideA.gives, ctx.market, ctx.picksByKey, ctx.exponent);
  const bGives = valueSide(proposal.sideB.gives, ctx.market, ctx.picksByKey, ctx.exponent);

  const sideA = evaluateSide(teamA, proposal.sideA.gives, proposal.sideB.gives, aGives, bGives, ctx);
  const sideB = evaluateSide(teamB, proposal.sideB.gives, proposal.sideA.gives, bGives, aGives, ctx);

  const missing = [...aGives.missing, ...bGives.missing];
  const missingInputs = missing.map((m) => `${assetName(m.assetKey, ctx)}: ${m.missingReason}`);
  const isScorable = missing.length === 0;

  const risks = collectRisks(proposal, [sideA, sideB], ctx);
  const valueGap =
    isScorable && aGives.raw !== null && bGives.raw !== null && aGives.adjusted !== null && bGives.adjusted !== null
      ? gapLabel(aGives.adjusted, bGives.adjusted, aGives.raw, bGives.raw, teamA.name, teamB.name)
      : null;

  return { issues, isValid: true, isScorable, missingInputs, sides: [sideA, sideB], valueGap, risks, market };
}

function evaluateSide(
  team: TradeTeam,
  outgoing: string[],
  incoming: string[],
  gives: SideValue,
  receives: SideValue,
  ctx: TradeContext,
): SideEvaluation {
  const outgoingPlayers = playerIds(outgoing);
  const incomingPlayers = playerIds(incoming);
  const after = [...team.playerIds.filter((id) => !outgoingPlayers.includes(id)), ...incomingPlayers];

  const capacity = rosterCapacity(team, outgoingPlayers, incomingPlayers, ctx);
  const lineup = ctx.market ? lineupChange(team.playerIds, after, ctx) : null;
  const depth = depthChange(team.playerIds, after, ctx);
  const netRaw = gives.raw !== null && receives.raw !== null ? receives.raw - gives.raw : null;
  const netAdjusted = gives.adjusted !== null && receives.adjusted !== null ? receives.adjusted - gives.adjusted : null;

  return {
    rosterId: team.rosterId,
    name: team.name,
    gives,
    receives,
    netRaw,
    netAdjusted,
    capacity,
    lineup,
    depth,
    timeline: timelineFit(team, outgoing, incoming, lineup, netAdjusted, ctx),
  };
}

function playerIds(assetKeys: string[]) {
  return assetKeys.flatMap((key) => {
    const parsed = parseAssetKey(key);
    return parsed?.kind === "player" ? [parsed.playerId] : [];
  });
}

export function rosterCapacity(team: TradeTeam, outgoing: string[], incoming: string[], ctx: TradeContext): RosterCapacity {
  const inactive = new Set([...team.reserve, ...team.taxi]);
  const activeBefore = team.playerIds.filter((id) => !inactive.has(id)).length;
  const activeOutgoing = outgoing.filter((id) => !inactive.has(id)).length;
  const activeAfter = activeBefore - activeOutgoing + incoming.length;
  const limit = ctx.format.activeRosterLimit;
  const requiredCuts = Math.max(0, activeAfter - limit);

  const remaining = team.playerIds.filter((id) => !inactive.has(id) && !outgoing.includes(id));
  const cutCandidates = requiredCuts
    ? remaining
        .map((id) => ({ id, value: ctx.market?.values.get(id)?.value ?? null }))
        .sort((a, b) => (a.value ?? -1) - (b.value ?? -1))
        .slice(0, requiredCuts)
        .map((c) => c.id)
    : [];
  return { activeBefore, activeAfter, limit, requiredCuts, cutCandidates };
}

function lineupChange(before: string[], after: string[], ctx: TradeContext): LineupChange {
  const solve = (ids: string[]) =>
    solveLineup(
      ctx.format.starterSlots,
      ids.map((id) => ({
        playerId: id,
        positions: ctx.players.get(id)?.positions ?? [],
        score: ctx.market?.values.get(id)?.value ?? null,
      })),
    );
  const b = solve(before);
  const a = solve(after);
  const startersBefore = new Set(b.assignments.map((x) => x.playerId).filter(Boolean));
  const startersAfter = new Set(a.assignments.map((x) => x.playerId).filter(Boolean));
  return {
    method: "market-value",
    before: b,
    after: a,
    entering: [...startersAfter].filter((id) => !startersBefore.has(id)) as string[],
    leaving: [...startersBefore].filter((id) => !startersAfter.has(id)) as string[],
    starterValueBefore: b.totalScore,
    starterValueAfter: a.totalScore,
  };
}

function depthChange(before: string[], after: string[], ctx: TradeContext) {
  const count = (ids: string[]) => {
    const map = new Map<string, number>();
    for (const id of ids) {
      const position = ctx.players.get(id)?.position ?? "Unknown";
      map.set(position, (map.get(position) ?? 0) + 1);
    }
    return map;
  };
  const b = count(before);
  const a = count(after);
  return [...new Set([...b.keys(), ...a.keys()])]
    .map((position) => ({ position, before: b.get(position) ?? 0, after: a.get(position) ?? 0 }))
    .filter((d) => d.before !== d.after);
}

function weightedAge(assetKeys: string[], ctx: TradeContext) {
  let weight = 0;
  let total = 0;
  for (const id of playerIds(assetKeys)) {
    const age = ctx.players.get(id)?.age;
    const value = ctx.market?.values.get(id)?.value;
    if (age == null || value == null) continue;
    weight += value;
    total += age * value;
  }
  return weight > 0 ? total / weight : null;
}

function timelineFit(
  team: TradeTeam,
  outgoing: string[],
  incoming: string[],
  lineup: LineupChange | null,
  netAdjusted: number | null,
  ctx: TradeContext,
): TimelineFit {
  const ageIn = weightedAge(incoming, ctx);
  const ageOut = weightedAge(outgoing, ctx);
  const ageDelta = ageIn !== null && ageOut !== null ? ageIn - ageOut : null;
  const lineupDelta = lineup ? lineup.starterValueAfter - lineup.starterValueBefore : null;
  const base = { strategy: team.strategy, source: team.strategySource };
  const strategyLabel = STRATEGIES[team.strategy].toLowerCase();

  if (team.strategy === "contending") {
    if (lineupDelta !== null && lineupDelta > 0) return { ...base, fit: "good", note: "Strengthens the starting lineup now." };
    if (lineupDelta !== null && lineup && lineupDelta < -0.05 * lineup.starterValueBefore) {
      return { ...base, fit: "poor", note: "Weakens the starting lineup, which cuts against contending." };
    }
    return { ...base, fit: "neutral", note: "Little change to the current starting lineup." };
  }
  if (team.strategy === "rebuilding") {
    const younger = ageDelta !== null && ageDelta < -1;
    const morePicks = incoming.some((k) => k.startsWith("pick:")) && !outgoing.some((k) => k.startsWith("pick:"));
    if (younger || morePicks) return { ...base, fit: "good", note: younger ? `Gets younger by ${Math.abs(ageDelta!).toFixed(1)} value-weighted years.` : "Adds draft capital." };
    if (ageDelta !== null && ageDelta > 1.5) return { ...base, fit: "poor", note: `Gets older by ${ageDelta.toFixed(1)} value-weighted years while ${strategyLabel}.` };
    return { ...base, fit: "neutral", note: "Roughly neutral for a rebuild." };
  }
  if (netAdjusted !== null && netAdjusted >= 0 && (ageDelta === null || Math.abs(ageDelta) <= 2)) {
    return { ...base, fit: "good", note: "Adds adjusted value without a big age swing." };
  }
  return { ...base, fit: "neutral", note: "Mixed fit for a balanced roster." };
}

function gapLabel(aGivesAdj: number, bGivesAdj: number, aGivesRaw: number, bGivesRaw: number, nameA: string, nameB: string) {
  const larger = Math.max(aGivesAdj, bGivesAdj);
  const adjusted = bGivesAdj - aGivesAdj;
  const share = larger > 0 ? Math.abs(adjusted) / larger : 0;
  const favored = adjusted > 0 ? nameA : nameB;
  const label = share < 0.05 ? "Close in adjusted market value" : share < 0.15 ? `Leans toward ${favored}` : `Clearly favors ${favored}`;
  return { raw: bGivesRaw - aGivesRaw, adjusted, share, label };
}

function collectRisks(proposal: TradeProposal, sides: SideEvaluation[], ctx: TradeContext) {
  const risks: string[] = [];
  for (const side of sides) {
    if (side.capacity.requiredCuts > 0) {
      const names = side.capacity.cutCandidates.map((id) => ctx.players.get(id)?.name ?? id).join(", ");
      risks.push(`${side.name} would be ${side.capacity.requiredCuts} over the active roster limit; likely cut: ${names}.`);
    }
    const lostStarters = side.lineup?.leaving ?? [];
    const gives = side.rosterId === proposal.sideA.rosterId ? proposal.sideA.gives : proposal.sideB.gives;
    if (lostStarters.length > 0 && side.lineup && side.lineup.after.unfilledSlots.length > side.lineup.before.unfilledSlots.length) {
      risks.push(`${side.name} would leave ${side.lineup.after.unfilledSlots.join(", ")} empty without a valid starter.`);
    }
    if (side.gives.topAssetShare !== null && side.receives.assets.length >= 2 && side.gives.assets.length === 1) {
      risks.push(`${side.name} consolidates out of one asset into ${side.receives.assets.length}; raw totals overstate the return.`);
    }
    for (const asset of side.gives.assets) {
      const range = asset.pick?.range;
      if (range && range.early !== null && range.late !== null) {
        const parsed = parseAssetKey(asset.assetKey);
        if (parsed?.kind === "pick") {
          risks.push(`${pickLabel({ season: parsed.season, round: parsed.round, slot: null })} slot is unknown; value ranges ${Math.round(range.late)}–${Math.round(range.early)}.`);
        }
      }
    }
    for (const key of gives) {
      const parsed = parseAssetKey(key);
      if (parsed?.kind !== "player") continue;
      const player = ctx.players.get(parsed.playerId);
      if (player?.evidenceStrength === "limited") risks.push(`${player.name} has a limited evidence base.`);
      if (player?.injuryStatus) risks.push(`${player.name} is listed as ${player.injuryStatus}.`);
    }
  }
  return [...new Set(risks)];
}

export function assetName(assetKey: string, ctx: Pick<TradeContext, "players" | "picksByKey" | "teams">) {
  const parsed = parseAssetKey(assetKey);
  if (!parsed) return assetKey;
  if (parsed.kind === "player") return ctx.players.get(parsed.playerId)?.name ?? `Unknown player ${parsed.playerId}`;
  const pick = ctx.picksByKey.get(assetKey);
  const original = ctx.teams.get(parsed.originalRosterId)?.name;
  const via = pick && pick.ownerRosterId !== parsed.originalRosterId ? original : undefined;
  return pickLabel({ season: parsed.season, round: parsed.round, slot: pick?.slot ?? null }, via);
}
