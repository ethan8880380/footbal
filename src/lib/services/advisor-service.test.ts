import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/repositories/settings-repository", async (original) => {
  const actual = await original<typeof import("@/lib/db/repositories/settings-repository")>();
  return { ...actual, getLeagueConfig: vi.fn(async (id: string) => actual.defaultConfig(id)) };
});
vi.mock("@/lib/db/repositories/history-repository", () => ({ getAiReport: vi.fn(async () => null), saveAiReport: vi.fn(async () => {}), getRecentSnapshots: vi.fn(async () => []) }));
vi.mock("@/lib/ai/provider", () => ({ aiConfig: () => ({ model: "test", provider: "openai" }), createExplanationProvider: vi.fn(() => null) }));

import { loadDemoDataset } from "@/lib/demo/demo-dataset";
import { buildLeagueModel } from "@/lib/analysis/league-model";
import { advisorRequestSchema } from "@/lib/ai/advisor";
import { createExplanationProvider } from "@/lib/ai/provider";
import { getAiReport, saveAiReport } from "@/lib/db/repositories/history-repository";
import { counteroffers, permittedProposal, proposalKey } from "@/lib/domain/trade/advisor";
import { evaluateTrade } from "@/lib/domain/trade/evaluate";
import { adviseLeague, buildAdvisorCards } from "./advisor-service";

async function fixture() { return buildLeagueModel(await loadDemoDataset(), new Date("2026-10-28T12:00:00Z")); }
const request = advisorRequestSchema.parse({ mode: "trades" });
beforeEach(() => { vi.clearAllMocks(); vi.mocked(createExplanationProvider).mockReturnValue(null); vi.mocked(getAiReport).mockResolvedValue(null); });

describe("league advisor", () => {
  it("finds owned, scorable trades and works with AI off", async () => {
    const model = await fixture();
    const result = await adviseLeague(model, request);
    expect(result.source).toBe("rules");
    expect(result.cards.length).toBeGreaterThan(0);
    for (const card of result.cards) {
      expect(evaluateTrade(card.proposal!, model.tradeContext).isScorable).toBe(true);
      expect(evaluateTrade(card.proposal!, model.tradeContext).isValid).toBe(true);
    }
  });
  it("honors protected assets and zero pick budget", async () => {
    const model = await fixture();
    model.dataset.config.pickBudget = { maxPicks: 0, allowFirsts: false };
    const first = (await buildAdvisorCards(model, request))[0];
    expect(first).toBeDefined();
    const key = first.proposal!.sideA.gives[0];
    model.dataset.config.flags.set(key, "protected");
    for (const card of await buildAdvisorCards(model, request)) {
      expect(card.proposal!.sideA.gives).not.toContain(key);
      expect(card.proposal!.sideA.gives.some((k) => k.startsWith("pick:"))).toBe(false);
    }
  });
  it("preserves incoming targets in unique legal counteroffers, including reversed sides", async () => {
    const model = await fixture();
    const proposal = (await buildAdvisorCards(model, request))[0].proposal!;
    const constraints = { rosterId: model.myTeam!.rosterId, flags: model.dataset.config.flags, pickBudget: model.dataset.config.pickBudget };
    for (const p of [proposal, { sideA: proposal.sideB, sideB: proposal.sideA }]) {
      const options = counteroffers(p, model.tradeContext, constraints, "fit");
      expect(options.length).toBeGreaterThan(0);
      expect(new Set(options.map((o) => proposalKey(o.proposal))).size).toBe(options.length);
      for (const option of options) {
        expect(proposalKey(option.proposal)).not.toBe(proposalKey(p));
        expect(permittedProposal(option.proposal, model.tradeContext, constraints)).toBe(true);
        const theirs = [option.proposal.sideA, option.proposal.sideB].find((s) => s.rosterId !== constraints.rosterId)!;
        expect(theirs.gives).toEqual(expect.arrayContaining(proposal.sideB.gives));
      }
    }
  });
  it("falls back on unsupported AI output and provider failure", async () => {
    const model = await fixture();
    const complete = vi.fn().mockResolvedValue(JSON.stringify({ choices: [{ id: "fake", evidenceIds: ["fake"] }] }));
    vi.mocked(createExplanationProvider).mockReturnValue({ id: "openai", model: "test", complete });
    expect((await adviseLeague(model, request)).source).toBe("rules");
    expect(saveAiReport).not.toHaveBeenCalled();
    complete.mockRejectedValue(new Error("secret provider error"));
    const failed = await adviseLeague(model, request);
    expect(failed.cards.length).toBeGreaterThan(0);
    expect(failed.message).not.toContain("secret");
  });
  it("caches verified AI selections and invalidates when goals change", async () => {
    const model = await fixture();
    const complete = vi.fn(async ({ user }: { user: string }) => {
      const packet = JSON.parse(user);
      return JSON.stringify({ choices: [{ id: packet.cards[0].id, evidenceIds: [packet.cards[0].facts[0].id] }] });
    });
    vi.mocked(createExplanationProvider).mockReturnValue({ id: "openai", model: "test", complete });
    expect((await adviseLeague(model, request)).source).toBe("ai");
    const saved = vi.mocked(saveAiReport).mock.calls[0][0];
    vi.mocked(getAiReport).mockResolvedValue({ ...saved, createdAt: "2026-10-28" });
    expect((await adviseLeague(model, request)).cached).toBe(true);
    expect(complete).toHaveBeenCalledTimes(1);
    vi.mocked(getAiReport).mockResolvedValue(null);
    await adviseLeague(model, { ...request, goal: "value" });
    expect(vi.mocked(saveAiReport).mock.calls[1][0].cacheKey).not.toBe(saved.cacheKey);
  });
  it("handles missing market, missing team, and absent snapshots", async () => {
    const model = await fixture();
    expect((await buildAdvisorCards(model, { ...request, mode: "changes" }))).toEqual([]);
    model.dataset.market = null;
    model.tradeContext.market = null;
    expect(await buildAdvisorCards(model, request)).toEqual([]);
    expect((await buildAdvisorCards(model, { ...request, mode: "team" })).length).toBeGreaterThan(0);
    model.myTeam = null;
    expect(await buildAdvisorCards(model, request)).toEqual([]);
  });
  it("only offers improvements for explicit lineup and value objectives", async () => {
    const model = await fixture();
    for (const goal of ["lineup", "value"] as const) {
      const cards = await buildAdvisorCards(model, { ...request, goal });
      expect(cards.length).toBeGreaterThan(0);
      for (const card of cards) {
        const mine = evaluateTrade(card.proposal!, model.tradeContext).sides!.find((s) => s.rosterId === model.myTeam!.rosterId)!;
        if (goal === "lineup") expect(mine.lineup!.starterValueAfter).toBeGreaterThan(mine.lineup!.starterValueBefore);
        else expect(mine.netAdjusted).toBeGreaterThan(0);
      }
    }
  });
});
