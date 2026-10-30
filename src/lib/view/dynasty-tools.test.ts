import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/repositories/settings-repository", async (original) => {
  const actual = await original<typeof import("@/lib/db/repositories/settings-repository")>();
  return { ...actual, getLeagueConfig: async (id: string) => actual.defaultConfig(id) };
});
import { loadDemoDataset } from "@/lib/demo/demo-dataset";
import { buildLeagueModel } from "@/lib/analysis/league-model";
import { findAssetTrades, assetOwner } from "@/lib/domain/trade/finder";
import { permittedProposal, proposalKey } from "@/lib/domain/trade/advisor";
import { solveLineup } from "@/lib/domain/lineup";
import { rosterPlan } from "./roster-plan";

async function fixture() {
  const model = buildLeagueModel(await loadDemoDataset(), new Date("2026-10-28T12:00:00Z"));
  const constraints = { rosterId: model.myTeam!.rosterId, flags: model.dataset.config.flags, pickBudget: { maxPicks: 2, allowFirsts: true } };
  return { model, ctx: model.tradeContext, constraints };
}

describe("asset trade finder", () => {
  it("shops a player across distinct owned teams with legal packages", async () => {
    const { ctx, constraints } = await fixture();
    const result = findAssetTrades({ assetKey: "player:demo-14", goal: "fit", returns: "any" }, ctx, constraints);
    expect(result.length).toBeGreaterThan(1);
    expect(new Set(result.map((o) => proposalKey(o.proposal))).size).toBe(result.length);
    expect(new Set(result.slice(0, 3).map((o) => o.proposal.sideB.rosterId)).size).toBe(3);
    for (const option of result) {
      expect(option.proposal.sideA.gives).toEqual(["player:demo-14"]);
      expect(permittedProposal(option.proposal, ctx, constraints)).toBe(true);
      expect(option.evaluation.valueGap!.share).toBeLessThanOrEqual(0.18);
    }
  });
  it("keeps the acquired player on the incoming side", async () => {
    const { ctx, constraints } = await fixture();
    const result = findAssetTrades({ assetKey: "player:demo-82", goal: "lineup", returns: "any" }, ctx, constraints);
    expect(result.length).toBeGreaterThan(0);
    for (const o of result) {
      expect(o.proposal.sideB.gives).toEqual(["player:demo-82"]);
      const me = o.evaluation.sides![0];
      expect(me.lineup!.starterValueAfter).toBeGreaterThan(me.lineup!.starterValueBefore);
    }
  });
  it("supports picks-only returns and correctly resolves traded pick ownership", async () => {
    const { model, ctx, constraints } = await fixture();
    const result = findAssetTrades({ assetKey: "player:demo-14", goal: "fit", returns: "picks" }, ctx, constraints);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((o) => o.proposal.sideB.gives.every((k) => k.startsWith("pick:")))).toBe(true);
    const pick = model.myTeam!.picks.find((p) => p.originalRosterId !== p.ownerRosterId)!;
    expect(pick).toBeDefined();
    expect(assetOwner(pick.key, ctx)).toBe(pick.ownerRosterId);
    expect(findAssetTrades({ assetKey: pick.key, goal: "fit", returns: "any" }, ctx, constraints).length).toBeGreaterThan(0);
  });
  it("respects protection, first restrictions and missing or unowned assets", async () => {
    const { ctx, constraints } = await fixture();
    const request = { assetKey: "player:demo-14", goal: "fit", returns: "any" } as const;
    constraints.flags.set(request.assetKey, "protected");
    expect(findAssetTrades(request, ctx, constraints)).toEqual([]);
    constraints.flags.clear();
    const first = [...ctx.picksByKey.values()].find((p) => p.ownerRosterId === constraints.rosterId && p.round === 1)!;
    expect(findAssetTrades({ ...request, assetKey: first.key }, ctx, { ...constraints, pickBudget: { maxPicks: 2, allowFirsts: false } })).toEqual([]);
    expect(findAssetTrades({ ...request, assetKey: "player:missing" }, ctx, constraints)).toEqual([]);
    const unowned = [...ctx.teams.values()].find((t) => t.isUnowned)!;
    expect(findAssetTrades({ ...request, assetKey: `player:${unowned.playerIds[0]}` }, ctx, constraints)).toEqual([]);
    expect(findAssetTrades(request, { ...ctx, market: null }, constraints)).toEqual([]);
  });
});

describe("roster planning", () => {
  it("holds current value fixed as ages advance and preserves unknown ages", async () => {
    const { model } = await fixture();
    const starter = model.myTeam!.lineup!.assignments.find((a) => a.playerId)!.playerId!;
    model.players.get(starter)!.age = null;
    const plan = rosterPlan(model)!;
    expect(plan.timeline).toHaveLength(4);
    for (const year of plan.timeline) {
      expect(year.rising + year.prime + year.decline + year.unknown).toBeCloseTo(plan.starterValue);
      expect(year.unknown).toBe(model.players.get(starter)!.market!.value);
    }
    expect(plan.timeline[3].decline).toBeGreaterThanOrEqual(plan.timeline[0].decline);
    expect(plan.ageCoverage).toBeLessThan(plan.starterCount);
  });
  it("recomputes each missing-starter scenario independently", async () => {
    const { model } = await fixture();
    const plan = rosterPlan(model)!;
    for (const row of plan.depth) {
      const inactive = new Set([...model.myTeam!.roster.reserve, ...model.myTeam!.roster.taxi]);
      const after = solveLineup(model.format.starterSlots, model.myTeam!.roster.players.filter((id) => id !== row.playerId && !inactive.has(id)).map((id) => ({ playerId: id, positions: model.players.get(id)!.positions, score: model.players.get(id)!.market?.value ?? null })));
      expect(row.loss).toBeCloseTo(plan.starterValue - after.totalScore);
      expect(row.replacements.some((name) => [...inactive].some((id) => model.players.get(id)?.name === name))).toBe(false);
      expect(row.replacements).not.toContain(row.name);
    }
  });
  it("excludes protected assets from bench trade capital and counts only owned picks", async () => {
    const { model } = await fixture();
    const before = rosterPlan(model)!;
    const player = model.players.get(before.surplus[0].playerId)!;
    player.flag = "protected";
    const plan = rosterPlan(model)!;
    expect(plan.surplus.some((p) => p.playerId === player.playerId)).toBe(false);
    expect(plan.capital.flatMap((c) => c.picks).length).toBe(model.myTeam!.picks.length);
    expect(plan.capital.flatMap((c) => c.picks).every((p) => p.ownerRosterId === model.myTeam!.rosterId)).toBe(true);
  });
  it("does not turn missing values into a zero-valued draft portfolio", async () => {
    const { model } = await fixture();
    model.dataset.market = null;
    expect(rosterPlan(model)!.capital.every((c) => c.value === null)).toBe(true);
    expect(rosterPlan(model)!.depth).toEqual([]);
    model.myTeam = null;
    expect(rosterPlan(model)).toBeNull();
  });
});
