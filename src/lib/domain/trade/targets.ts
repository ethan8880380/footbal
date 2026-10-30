import { solveLineup } from "../lineup";
import { SLOT_ELIGIBILITY } from "../positions";
import { agePhase, ordinalPct, type EvidenceStrength, type Reason } from "../recommendations";
import type { AssetFlag, PickBudget, Recommendation, Strategy } from "../types";
import { adjustValue, playerKey } from "../valuation";
import { evaluateTrade, type TradeEvaluation } from "./evaluate";
import { offerSummary } from "./summary";
import type { TradeContext, TradeProposal } from "./types";

export const TARGET_HEURISTICS = {
  minTargetValue: 1500,
  shortlistSize: 8,
  playerPoolSize: 10,
  pickPoolSize: 4,
  fillerMaxShare: 0.4,
  openingBand: [0.9, 1.05] as const,
  alternativeBand: [0.95, 1.2] as const,
  searchBand: [0.88, 1.22] as const,
  fullEvaluationsPerTarget: 10,
  maxRequiredCuts: 1,
};

export interface TargetPlayerInfo {
  recommendation: Recommendation;
  productionPercentile: number | null;
  headline: string;
  strengths: Reason[];
  concerns: Reason[];
  evidenceStrength: EvidenceStrength;
  isMyStarter: boolean;
}

export interface TargetSearchInput {
  ctx: TradeContext;
  myRosterId: string;
  strategy: Strategy;
  targetPositions: string[];
  pickBudget: PickBudget;
  flags: Map<string, AssetFlag>;
  info: Map<string, TargetPlayerInfo>;
}

export interface PositionNeed {
  position: string;
  myAverage: number | null;
  leagueAverage: number | null;
  deficit: number;
  unfilled: number;
}

export interface PackageOption {
  proposal: TradeProposal;
  shape: string;
  ratio: number;
  evaluation: TradeEvaluation;
  summary: string;
}

export interface TradeTarget {
  playerId: string;
  ownerRosterId: string;
  ownerName: string;
  position: string | null;
  value: number;
  score: number;
  fitReasons: string[];
  whyTheyMightMove: string[];
  opening: PackageOption | null;
  alternative: PackageOption | null;
  objections: string[];
  noPackageReason: string | null;
}

export function positionNeeds(ctx: TradeContext, myRosterId: string): PositionNeed[] {
  if (!ctx.market) return [];
  const byPosition = new Map<string, { mine: number[]; league: number[]; unfilled: number }>();
  for (const team of ctx.teams.values()) {
    const lineup = solveLineup(
      ctx.format.starterSlots,
      team.playerIds.map((id) => ({ playerId: id, positions: ctx.players.get(id)?.positions ?? [], score: ctx.market!.values.get(id)?.value ?? null })),
    );
    for (const assignment of lineup.assignments) {
      const player = assignment.playerId ? ctx.players.get(assignment.playerId) : undefined;
      const position = player?.positions.find((p) => SLOT_ELIGIBILITY[assignment.slot]?.includes(p)) ?? player?.position ?? null;
      if (!position) continue;
      const entry = byPosition.get(position) ?? { mine: [], league: [], unfilled: 0 };
      entry.league.push(assignment.score ?? 0);
      if (team.rosterId === myRosterId) entry.mine.push(assignment.score ?? 0);
      byPosition.set(position, entry);
    }
    if (team.rosterId === myRosterId) {
      for (const slot of lineup.unfilledSlots) {
        const eligible = SLOT_ELIGIBILITY[slot] ?? [];
        if (eligible.length !== 1) continue;
        const entry = byPosition.get(eligible[0]) ?? { mine: [], league: [], unfilled: 0 };
        entry.unfilled += 1;
        byPosition.set(eligible[0], entry);
      }
    }
  }
  const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
  return [...byPosition.entries()]
    .map(([position, entry]) => {
      const myAverage = avg(entry.mine);
      const leagueAverage = avg(entry.league);
      const deficit = (leagueAverage ?? 0) - (myAverage ?? 0) + entry.unfilled * 2000;
      return { position, myAverage, leagueAverage, deficit, unfilled: entry.unfilled };
    })
    .sort((a, b) => b.deficit - a.deficit);
}

export function findTradeTargets(input: TargetSearchInput): { targets: TradeTarget[]; needs: PositionNeed[]; poolSize: number } {
  const { ctx, myRosterId } = input;
  const market = ctx.market;
  const me = ctx.teams.get(myRosterId);
  if (!market || !me) return { targets: [], needs: [], poolSize: 0 };

  const needs = positionNeeds(ctx, myRosterId);
  const targetPositions = input.targetPositions.length
    ? input.targetPositions
    : needs.filter((n) => n.deficit > 0).slice(0, 2).map((n) => n.position);
  const positions = targetPositions.length ? targetPositions : needs.slice(-2).map((n) => n.position);
  const maxDeficit = Math.max(1, ...needs.map((n) => n.deficit));

  const pool = buildAssetPool(input);
  const topAdjusted = [...pool.players, ...pool.picks].map((a) => a.adjusted).sort((a, b) => b - a);
  const affordable = (topAdjusted[0] ?? 0) + (topAdjusted[1] ?? 0);

  const candidates: Omit<TradeTarget, "opening" | "alternative" | "objections" | "noPackageReason">[] = [];
  for (const team of ctx.teams.values()) {
    if (team.rosterId === myRosterId || team.isUnowned) continue;
    const theirLineup = solveLineup(
      ctx.format.starterSlots,
      team.playerIds.map((id) => ({ playerId: id, positions: ctx.players.get(id)?.positions ?? [], score: market.values.get(id)?.value ?? null })),
    );
    const theirStarters = new Set(theirLineup.assignments.map((a) => a.playerId));

    for (const playerId of team.playerIds) {
      const player = ctx.players.get(playerId);
      const value = market.values.get(playerId)?.value ?? null;
      if (!player || value === null || !player.position || !positions.includes(player.position)) continue;
      if (value < TARGET_HEURISTICS.minTargetValue || adjustValue(value, ctx.exponent) > affordable) continue;
      const info = input.info.get(playerId);
      if (!info || info.recommendation === "insufficient") continue;

      const phase = agePhase(player.position, player.age);
      const pct = info.productionPercentile;
      if (!fitsStrategy(input.strategy, phase, pct, player.age)) continue;

      const need = needs.find((n) => n.position === player.position);
      const fitReasons = [
        need && need.deficit > 0
          ? `Your ${player.position} starters average ${fmt(need.myAverage)} in market value vs a league average of ${fmt(need.leagueAverage)}.`
          : `You chose ${player.position} as a target position.`,
        strategyReason(input.strategy, phase, player.age, pct),
      ];

      const theirDepth = team.playerIds.filter((id) => ctx.players.get(id)?.position === player.position && market.values.get(id)?.value != null).length;
      const theirStartersAtPos = theirLineup.assignments.filter((a) => a.playerId && ctx.players.get(a.playerId)?.position === player.position).length;
      const whyTheyMightMove: string[] = [];
      if (theirDepth - theirStartersAtPos >= 1 || !theirStarters.has(playerId)) {
        whyTheyMightMove.push(
          theirStarters.has(playerId)
            ? `They roster ${theirDepth} valued ${player.position}s for ${theirStartersAtPos} starting spot${theirStartersAtPos === 1 ? "" : "s"}.`
            : `He is not in their strongest lineup by market value.`,
        );
      }
      if (team.strategy === "rebuilding" && phase !== "rising") {
        whyTheyMightMove.push(`Their roster profile reads as rebuilding (${team.strategySource}), and he is ${phase === "decline" ? "past" : "in"} his prime.`);
      }
      if (team.strategy === "contending" && phase === "rising" && (pct ?? 0) < 0.5) {
        whyTheyMightMove.push(`Their roster profile reads as contending (${team.strategySource}); a developing player helps them less now.`);
      }

      const needWeight = need ? Math.max(0, need.deficit) / maxDeficit : 0.5;
      const score =
        needWeight * 2 + (pct ?? 0.4) + (whyTheyMightMove.length ? 0.5 * whyTheyMightMove.length : -0.5) + (info.evidenceStrength === "limited" ? -0.5 : 0);
      candidates.push({
        playerId,
        ownerRosterId: team.rosterId,
        ownerName: team.name,
        position: player.position,
        value,
        score,
        fitReasons,
        whyTheyMightMove: whyTheyMightMove.length ? whyTheyMightMove : ["No clear surplus or timeline mismatch on their side; expect to pay full price."],
      });
    }
  }

  const shortlist = candidates.sort((a, b) => b.score - a.score).slice(0, TARGET_HEURISTICS.shortlistSize);
  const targets = shortlist.map((candidate) => ({ ...candidate, ...buildPackages(candidate, pool, input) }));
  return { targets, needs, poolSize: pool.players.length + pool.picks.length };
}

interface PoolAsset {
  key: string;
  value: number;
  adjusted: number;
  cost: number;
  isPick: boolean;
  isFirst: boolean;
}

function buildAssetPool(input: TargetSearchInput) {
  const { ctx, myRosterId } = input;
  const market = ctx.market!;
  const me = ctx.teams.get(myRosterId)!;
  const players: PoolAsset[] = [];
  for (const playerId of me.playerIds) {
    const key = playerKey(playerId);
    const value = market.values.get(playerId)?.value ?? null;
    const flag = input.flags.get(key);
    if (value === null || flag === "protected") continue;
    const info = input.info.get(playerId);
    let cost = 0;
    if (info?.isMyStarter) cost += 1.5;
    if (info?.recommendation === "keep") cost += 1;
    if (info?.recommendation === "shop") cost -= 1.5;
    if (flag === "available") cost -= 2;
    players.push({ key, value, adjusted: adjustValue(value, ctx.exponent), cost, isPick: false, isFirst: false });
  }
  const tier = (a: PoolAsset) => (a.cost >= 2 ? 1 : 0);
  players.sort((a, b) => tier(a) - tier(b) || b.value - a.value);

  const picks: PoolAsset[] = [];
  if (input.pickBudget.maxPicks > 0) {
    for (const pick of ctx.picksByKey.values()) {
      if (pick.ownerRosterId !== myRosterId) continue;
      if (input.flags.get(pick.key) === "protected") continue;
      if (pick.round === 1 && !input.pickBudget.allowFirsts) continue;
      const tier = market.picks.get(`pick:${pick.season}:${pick.round}:mid`)?.value ?? null;
      if (tier === null) continue;
      picks.push({ key: pick.key, value: tier, adjusted: adjustValue(tier, ctx.exponent), cost: 0.5, isPick: true, isFirst: pick.round === 1 });
    }
    picks.sort((a, b) => b.value - a.value);
  }
  return {
    players: players.slice(0, TARGET_HEURISTICS.playerPoolSize),
    picks: picks.slice(0, TARGET_HEURISTICS.pickPoolSize),
  };
}

function buildPackages(
  target: Omit<TradeTarget, "opening" | "alternative" | "objections" | "noPackageReason">,
  pool: ReturnType<typeof buildAssetPool>,
  input: TargetSearchInput,
): Pick<TradeTarget, "opening" | "alternative" | "objections" | "noPackageReason"> {
  const { ctx } = input;
  const market = ctx.market!;
  const targetKey = playerKey(target.playerId);
  const targetAdjusted = adjustValue(target.value, ctx.exponent);
  const theirTeam = ctx.teams.get(target.ownerRosterId)!;

  const fillers = theirTeam.playerIds
    .filter((id) => id !== target.playerId)
    .map((id) => ({ key: playerKey(id), value: market.values.get(id)?.value ?? null }))
    .filter((f): f is { key: string; value: number } => f.value !== null && f.value <= target.value * TARGET_HEURISTICS.fillerMaxShare && f.value >= 300)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  const assets = [...pool.players, ...pool.picks];
  const combos: { mine: PoolAsset[]; theirs: { key: string; value: number }[] }[] = [];
  for (let i = 0; i < assets.length; i++) {
    combos.push({ mine: [assets[i]], theirs: [] });
    for (let j = i + 1; j < assets.length; j++) {
      const pair = [assets[i], assets[j]];
      if (pair.filter((a) => a.isPick).length > input.pickBudget.maxPicks) continue;
      if (pair.every((a) => a.isPick)) continue;
      combos.push({ mine: pair, theirs: [] });
      for (const filler of fillers) combos.push({ mine: pair, theirs: [filler] });
    }
  }

  const scored = combos
    .map((combo) => {
      const mineAdjusted = combo.mine.reduce((t, a) => t + a.adjusted, 0);
      const theirsAdjusted = targetAdjusted + combo.theirs.reduce((t, f) => t + adjustValue(f.value, ctx.exponent), 0);
      const ratio = mineAdjusted / theirsAdjusted;
      const cost = combo.mine.reduce((t, a) => t + a.cost, 0);
      return { combo, ratio, cost };
    })
    .filter((c) => c.ratio >= TARGET_HEURISTICS.searchBand[0] && c.ratio <= TARGET_HEURISTICS.searchBand[1])
    .sort((a, b) => a.cost + Math.abs(a.ratio - 0.98) * 3 - (b.cost + Math.abs(b.ratio - 0.98) * 3))
    .slice(0, TARGET_HEURISTICS.fullEvaluationsPerTarget);

  const options: PackageOption[] = [];
  for (const candidate of scored) {
    const proposal: TradeProposal = {
      sideA: { rosterId: input.myRosterId, gives: candidate.combo.mine.map((a) => a.key) },
      sideB: { rosterId: target.ownerRosterId, gives: [targetKey, ...candidate.combo.theirs.map((f) => f.key)] },
    };
    const evaluation = evaluateTrade(proposal, ctx);
    if (!evaluation.isValid || !evaluation.isScorable || !evaluation.sides) continue;
    if (evaluation.sides.some((s) => s.capacity.requiredCuts > TARGET_HEURISTICS.maxRequiredCuts)) continue;
    options.push({
      proposal,
      shape: shapeLabel(candidate.combo.mine, candidate.combo.theirs.length + 1),
      ratio: candidate.ratio,
      evaluation,
      summary: offerSummary(proposal, evaluation, ctx),
    });
  }

  const inBand = (o: PackageOption, band: readonly [number, number]) => o.ratio >= band[0] && o.ratio <= band[1];
  const opening = options.find((o) => inBand(o, TARGET_HEURISTICS.openingBand)) ?? options.find((o) => inBand(o, TARGET_HEURISTICS.alternativeBand)) ?? null;
  const centerpiece = (o: PackageOption) =>
    o.proposal.sideA.gives.reduce((best, key) => ((market.values.get(key.slice(7))?.value ?? 0) > (market.values.get(best.slice(7))?.value ?? 0) ? key : best));
  const candidates = options.filter((o) => o !== opening && inBand(o, TARGET_HEURISTICS.alternativeBand));
  const alternative =
    candidates.find((o) => opening && centerpiece(o) !== centerpiece(opening)) ??
    candidates.find((o) => o.shape !== opening?.shape) ??
    candidates[0] ??
    null;

  const objections = [...new Set([...(opening?.evaluation.risks ?? []), ...(alternative?.evaluation.risks ?? [])])];
  const info = input.info.get(target.playerId);
  for (const concern of info?.concerns ?? []) objections.push(concern.text);

  return {
    opening,
    alternative,
    objections,
    noPackageReason: opening
      ? null
      : scored.length === 0
        ? "No combination of your tradeable assets lands within the value band. Mark more players available or raise the pick budget."
        : "Packages in the value band failed roster-capacity or data checks.",
  };
}

function fitsStrategy(strategy: Strategy, phase: ReturnType<typeof agePhase>, pct: number | null, age: number | null) {
  if (!phase) return false;
  if (strategy === "contending") return phase !== "decline" ? (pct ?? 0) >= 0.5 || phase === "prime" : (pct ?? 0) >= 0.75;
  if (strategy === "rebuilding") return phase === "rising" || (phase === "prime" && (age ?? 99) <= 25);
  return phase !== "decline";
}

function strategyReason(strategy: Strategy, phase: ReturnType<typeof agePhase>, age: number | null, pct: number | null) {
  const ageText = age !== null ? `At ${age.toFixed(1)}` : "Age unknown;";
  const phaseText = phase === "rising" ? "he is pre-prime" : phase === "prime" ? "he is in his prime" : "he is past the typical prime";
  const prod = pct !== null ? `, producing at the ${ordinalPct(pct)} percentile of rostered peers` : "";
  const fit = strategy === "contending" ? "helps a contender now" : strategy === "rebuilding" ? "fits a rebuild timeline" : "fits a balanced plan";
  return `${ageText} ${phaseText}${prod}; ${fit}.`;
}

function shapeLabel(mine: PoolAsset[], theirs: number) {
  const picks = mine.filter((a) => a.isPick).length;
  const base = `${mine.length}-for-${theirs}`;
  return picks ? `${base} with ${picks === 1 ? "a pick" : `${picks} picks`}` : base;
}

function fmt(value: number | null) {
  return value === null ? "n/a" : Math.round(value).toLocaleString("en-US");
}
