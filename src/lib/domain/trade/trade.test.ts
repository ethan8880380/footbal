import { describe, expect, it } from "vitest";
import { analyzeLeagueFormat } from "../league-format";
import { pickKey, type PickAsset } from "../picks";
import type { MarketSnapshot, MarketValueRecord } from "../types";
import { adjustValue } from "../valuation";
import { evaluateTrade } from "./evaluate";
import { findTradeTargets, type TargetPlayerInfo } from "./targets";
import type { TradeContext, TradePlayer, TradeTeam } from "./types";
import { validateTrade } from "./validate";

function value(playerId: string, v: number | null): [string, MarketValueRecord] {
  return [playerId, { playerId, value: v, rank: null, positionRank: null, change7d: null, change30d: null, url: null }];
}

function player(playerId: string, position: string, age = 25): [string, TradePlayer] {
  return [playerId, { playerId, name: `Player ${playerId}`, position, positions: [position], age, evidenceStrength: "strong", injuryStatus: null }];
}

function team(rosterId: string, playerIds: string[], extra: Partial<TradeTeam> = {}): [string, TradeTeam] {
  return [rosterId, { rosterId, name: `Team ${rosterId}`, playerIds, reserve: [], taxi: [], strategy: "balanced", strategySource: "estimate", strategyEvidence: [], ...extra }];
}

function buildContext(overrides: { rosterPositions?: string[]; teams?: [string, TradeTeam][] } = {}): TradeContext {
  const pick: PickAsset = { key: pickKey("2027", 1, "B"), season: "2027", round: 1, originalRosterId: "B", ownerRosterId: "A", slot: null, slotSource: null };
  const market: MarketSnapshot = {
    provider: "test",
    providerLabel: "Test",
    variantKey: "test",
    format: "sf_dynasty",
    valuedAt: "2026-10-28",
    retrievedAt: "2026-10-28",
    sourceUrl: "",
    attribution: null,
    values: new Map([value("a1", 4000), value("a2", 3500), value("a3", 500), value("b1", 5000), value("b2", 800), value("idp1", null), value("b3", 300)]),
    picks: new Map([
      ["pick:2027:1:early", { pickId: "pick:2027:1:early", year: 2027, round: 1, slot: null, variant: "early", value: 4000 }],
      ["pick:2027:1:mid", { pickId: "pick:2027:1:mid", year: 2027, round: 1, slot: null, variant: "mid", value: 3000 }],
      ["pick:2027:1:late", { pickId: "pick:2027:1:late", year: 2027, round: 1, slot: null, variant: "late", value: 2200 }],
    ]),
    approximations: [],
  };
  const rosterPositions = overrides.rosterPositions ?? ["QB", "RB", "WR", "TE", "FLEX", "BN", "BN"];
  return {
    format: analyzeLeagueFormat({ rosterPositions, settings: { type: 2 }, scoringSettings: { rec: 1 }, totalRosters: 2 }),
    market,
    picksByKey: new Map([[pick.key, pick]]),
    teams: new Map(overrides.teams ?? [team("A", ["a1", "a2", "a3", "idp1"]), team("B", ["b1", "b2", "b3"])]),
    players: new Map([player("a1", "WR"), player("a2", "RB"), player("a3", "TE"), player("idp1", "LB"), player("b1", "WR", 24), player("b2", "RB"), player("b3", "QB")]),
    exponent: 1.35,
  };
}

describe("trade validation", () => {
  const ctx = buildContext();

  it("rejects duplicate assets on one side", () => {
    const issues = validateTrade({ sideA: { rosterId: "A", gives: ["player:a1", "player:a1"] }, sideB: { rosterId: "B", gives: ["player:b1"] } }, ctx);
    expect(issues.map((i) => i.code)).toContain("duplicate_asset");
  });

  it("rejects an asset on both sides", () => {
    const issues = validateTrade({ sideA: { rosterId: "A", gives: ["player:a1"] }, sideB: { rosterId: "B", gives: ["player:a1"] } }, ctx);
    expect(issues.map((i) => i.code)).toContain("asset_on_both_sides");
  });

  it("rejects players and picks the side does not own", () => {
    const issues = validateTrade(
      { sideA: { rosterId: "A", gives: ["player:b1"] }, sideB: { rosterId: "B", gives: [pickKey("2027", 1, "B")] } },
      ctx,
    );
    expect(issues.filter((i) => i.code === "not_owned")).toHaveLength(2);
  });

  it("accepts a pick traded to the side even though another roster originally held it", () => {
    const issues = validateTrade({ sideA: { rosterId: "A", gives: [pickKey("2027", 1, "B")] }, sideB: { rosterId: "B", gives: ["player:b2"] } }, ctx);
    expect(issues).toHaveLength(0);
  });

  it("rejects same-team and empty trades", () => {
    const codes = validateTrade({ sideA: { rosterId: "A", gives: [] }, sideB: { rosterId: "A", gives: ["player:a1"] } }, ctx).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["same_team", "empty_side"]));
  });
});

describe("trade evaluation", () => {
  it("flags required cuts when a two-for-one exceeds roster capacity", () => {
    const ctx = buildContext({ rosterPositions: ["QB", "RB", "WR", "BN"], teams: [team("A", ["a1", "a2", "a3"]), team("B", ["b1", "b2", "b3", "x"])] });
    const evaluation = evaluateTrade({ sideA: { rosterId: "A", gives: ["player:a1", "player:a2"] }, sideB: { rosterId: "B", gives: ["player:b1"] } }, ctx);
    const [a, b] = evaluation.sides!;
    expect(a.capacity).toMatchObject({ activeBefore: 3, activeAfter: 2, requiredCuts: 0 });
    expect(b.capacity).toMatchObject({ activeBefore: 4, activeAfter: 5, limit: 4, requiredCuts: 1 });
    expect(b.capacity.cutCandidates).toHaveLength(1);
    expect(evaluation.risks.some((r) => r.includes("over the active roster limit"))).toBe(true);
  });

  it("does not count taxi or reserve players against active roster space", () => {
    const ctx = buildContext({ rosterPositions: ["QB", "RB", "BN"], teams: [team("A", ["a1", "a2", "a3"], { taxi: ["a3"] }), team("B", ["b1"])] });
    const evaluation = evaluateTrade({ sideA: { rosterId: "A", gives: ["player:a3"] }, sideB: { rosterId: "B", gives: ["player:b1"] } }, ctx);
    expect(evaluation.sides![0].capacity).toMatchObject({ activeBefore: 2, activeAfter: 3, requiredCuts: 0 });
  });

  it("applies the consolidation adjustment so two mid assets do not equal one elite asset", () => {
    const ctx = buildContext();
    const evaluation = evaluateTrade({ sideA: { rosterId: "A", gives: ["player:a2", "player:a3"] }, sideB: { rosterId: "B", gives: ["player:b1"] } }, {
      ...ctx,
      market: { ...ctx.market!, values: new Map([value("a2", 3500), value("a3", 3500), value("b1", 7000)]) },
    });
    const [a, b] = evaluation.sides!;
    expect(a.gives.raw).toBe(7000);
    expect(b.gives.raw).toBe(7000);
    expect(a.gives.adjusted!).toBeLessThan(b.gives.adjusted!);
    expect(a.gives.adjusted).toBeCloseTo(adjustValue(3500, 1.35) * 2);
    expect(evaluation.valueGap?.label).toContain("Team A");
  });

  it("refuses to score a package containing an unvalued IDP player", () => {
    const ctx = buildContext();
    const evaluation = evaluateTrade({ sideA: { rosterId: "A", gives: ["player:idp1"] }, sideB: { rosterId: "B", gives: ["player:b3"] } }, ctx);
    expect(evaluation.isValid).toBe(true);
    expect(evaluation.isScorable).toBe(false);
    expect(evaluation.valueGap).toBeNull();
    expect(evaluation.missingInputs[0]).toContain("Player idp1");
    expect(evaluation.sides![0].gives.raw).toBeNull();
  });

  it("values unknown-slot picks at the mid scenario and exposes the range", () => {
    const ctx = buildContext();
    const evaluation = evaluateTrade({ sideA: { rosterId: "A", gives: [pickKey("2027", 1, "B")] }, sideB: { rosterId: "B", gives: ["player:b2"] } }, ctx);
    const pick = evaluation.sides![0].gives.assets[0];
    expect(pick.value).toBe(3000);
    expect(pick.pick?.range).toEqual({ early: 4000, mid: 3000, late: 2200 });
  });
});

describe("target generation", () => {
  it("keeps unvalued IDP assets out of generated packages", () => {
    const ctx = buildContext({ rosterPositions: ["QB", "RB", "WR", "TE", "FLEX", "LB", "BN", "BN", "BN", "BN"] });
    const info = new Map<string, TargetPlayerInfo>(
      ["a1", "a2", "a3", "idp1", "b1", "b2", "b3"].map((id) => [
        id,
        { recommendation: "monitor", productionPercentile: 0.8, headline: "", strengths: [], concerns: [], evidenceStrength: "strong", isMyStarter: false },
      ]),
    );
    const { targets } = findTradeTargets({ ctx, myRosterId: "A", strategy: "balanced", targetPositions: ["WR"], pickBudget: { maxPicks: 1, allowFirsts: true }, flags: new Map(), info });
    const offered = targets.flatMap((t) => [t.opening, t.alternative]).filter(Boolean).flatMap((o) => o!.proposal.sideA.gives);
    expect(targets.length).toBeGreaterThan(0);
    expect(offered).not.toContain("player:idp1");
    for (const option of targets.flatMap((t) => [t.opening, t.alternative]).filter(Boolean)) {
      expect(option!.evaluation.isScorable).toBe(true);
      expect(new Set(option!.proposal.sideA.gives).size).toBe(option!.proposal.sideA.gives.length);
    }
  });

  it("never offers protected assets", () => {
    const ctx = buildContext({ rosterPositions: ["QB", "RB", "WR", "TE", "FLEX", "BN", "BN", "BN", "BN"] });
    const info = new Map<string, TargetPlayerInfo>(
      ["a1", "a2", "a3", "b1", "b2", "b3"].map((id) => [
        id,
        { recommendation: "monitor", productionPercentile: 0.8, headline: "", strengths: [], concerns: [], evidenceStrength: "strong", isMyStarter: false },
      ]),
    );
    const { targets } = findTradeTargets({
      ctx,
      myRosterId: "A",
      strategy: "balanced",
      targetPositions: ["WR"],
      pickBudget: { maxPicks: 1, allowFirsts: true },
      flags: new Map([["player:a1", "protected"]]),
      info,
    });
    const offered = targets.flatMap((t) => [t.opening, t.alternative]).filter(Boolean).flatMap((o) => o!.proposal.sideA.gives);
    expect(offered.length).toBeGreaterThan(0);
    expect(offered).not.toContain("player:a1");
  });
});
