import type { LeagueModel } from "@/lib/analysis/league-model";
import { solveLineup } from "@/lib/domain/lineup";
import { valuePick } from "@/lib/domain/picks";
import { agePhase, AGE_CURVES } from "@/lib/domain/recommendations";

export function rosterPlan(model: LeagueModel) {
  const me = model.myTeam;
  if (!me) return null;
  const market = model.dataset.market;
  const players = me.roster.players.flatMap((id) => model.players.get(id) ? [model.players.get(id)!] : []);
  const inactive = new Set([...me.roster.reserve, ...me.roster.taxi]);
  const activePlayers = players.filter((p) => !inactive.has(p.playerId));
  const currentLineup = market ? solveLineup(model.format.starterSlots, activePlayers.map((p) => ({ playerId: p.playerId, positions: p.positions, score: market.values.get(p.playerId)?.value ?? null }))) : null;
  const starterIds = new Set(currentLineup?.assignments.flatMap((a) => a.playerId ? [a.playerId] : []) ?? []);
  const starters = players.filter((p) => starterIds.has(p.playerId));
  const totalValue = players.reduce((sum, p) => sum + (p.market?.value ?? 0), 0);
  const starterValue = starters.reduce((sum, p) => sum + (p.market?.value ?? 0), 0);
  const ageCoverage = starters.filter((p) => agePhase(p.position, p.age) !== null).length;
  const timeline = [0, 1, 2, 3].map((years) => {
    const groups = { rising: 0, prime: 0, decline: 0, unknown: 0 };
    for (const player of starters) {
      const phase = agePhase(player.position, player.age === null ? null : player.age + years) ?? "unknown";
      groups[phase] += player.market?.value ?? 0;
    }
    return { years, ...groups, declineShare: starterValue > 0 ? groups.decline / starterValue : null };
  });
  const replacements = starters.flatMap((p) => {
    const threshold = p.position ? AGE_CURVES[p.position]?.decline : undefined;
    return threshold !== undefined && p.age !== null && threshold - p.age <= 2 ? [{ playerId: p.playerId, name: p.name, position: p.position, age: p.age, threshold, value: p.market?.value ?? null }] : [];
  }).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const surplus = players.filter((p) => !starterIds.has(p.playerId) && (p.market?.value ?? 0) > 0 && p.flag !== "protected")
    .sort((a, b) => (b.market?.value ?? 0) - (a.market?.value ?? 0)).slice(0, 5)
    .map((p) => ({ playerId: p.playerId, name: p.name, position: p.position, value: p.market!.value! }));
  const depth = market && currentLineup ? starters.map((p) => {
    const lineup = solveLineup(model.format.starterSlots, activePlayers.filter((other) => other.playerId !== p.playerId).map((other) => ({
      playerId: other.playerId, positions: other.positions, score: market.values.get(other.playerId)?.value ?? null,
    })));
    return { playerId: p.playerId, name: p.name, position: p.position,
      loss: Math.max(0, currentLineup.totalScore - lineup.totalScore),
      replacements: lineup.assignments.flatMap((a) => a.playerId && !starterIds.has(a.playerId) ? [model.players.get(a.playerId)?.name ?? a.playerId] : []),
      unfilled: Math.max(0, lineup.unfilledSlots.length - currentLineup.unfilledSlots.length),
    };
  }).sort((a, b) => b.unfilled - a.unfilled || b.loss - a.loss) : [];
  const capital = model.pickInventory.seasons.filter((s) => s.status === "confirmed" || s.status === "unconfirmed").map((season) => {
    const picks = me.picks.filter((p) => p.season === season.season);
    const valued = picks.map((p) => ({ pick: p, valuation: market ? valuePick(p, market) : null }));
    const ownFirst = model.pickInventory.picks.find((p) => p.season === season.season && p.originalRosterId === me.rosterId && p.round === 1);
    return {
      season: season.season, confirmed: season.status === "confirmed", reason: season.reason,
      ownFirst: ownFirst ? model.teamsById.get(ownFirst.ownerRosterId)?.name ?? "Unknown team" : null,
      ownFirstHeld: ownFirst?.ownerRosterId === me.rosterId,
      value: market && valued.every((p) => p.valuation?.value !== null && p.valuation?.value !== undefined) ? valued.reduce((sum, p) => sum + (p.valuation?.value ?? 0), 0) : null,
      picks: valued.map(({ pick, valuation }) => ({ ...pick, value: valuation?.value ?? null })),
    };
  });
  const sortedValues = players.map((p) => p.market?.value ?? 0).sort((a, b) => b - a);
  return { timeline, ageCoverage, starterCount: starters.length, starterValue, replacements, surplus, depth, capital,
    topThreeShare: totalValue > 0 ? sortedValues.slice(0, 3).reduce((a, b) => a + b, 0) / totalValue : null,
    unvaluedPlayers: players.filter((p) => p.market?.value == null).length,
  };
}
