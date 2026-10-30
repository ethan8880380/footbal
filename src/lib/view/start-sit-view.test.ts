import { describe, expect, it } from "vitest";
import { buildLeagueModel } from "@/lib/analysis/league-model";
import { loadDemoDataset } from "@/lib/demo/demo-dataset";
import { buildStartSitView, startSitWeeks } from "./start-sit-view";

const projections = { sleeper: new Map(), props: new Map() };

async function fixture() {
  const model = buildLeagueModel(await loadDemoDataset(), new Date("2026-10-28T12:00:00Z"));
  const rosterId = model.myTeam!.rosterId;
  const schedule = model.dataset.seasonData!.schedule;
  return { model, rosterId, schedule, season: model.statsSeason! };
}

describe("buildStartSitView", () => {
  it("fills every starter slot with distinct, eligible players and never projects below the current lineup", async () => {
    const { model, rosterId, schedule, season } = await fixture();
    const week = startSitWeeks(schedule, season).at(-1)!;
    const view = buildStartSitView(model, rosterId, { season, week, schedule, projections, currentStarters: null, now: new Date("2026-10-01T00:00:00Z") })!;

    const ids = view.slots.map((s) => s.player?.playerId).filter(Boolean);
    expect(view.slots).toHaveLength(model.format.starterSlots.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(view.optimalTotal).toBeGreaterThanOrEqual(view.currentTotal);
    expect(view.linedGames).toBe(view.games);
    for (const move of view.moves) expect(move.gain).toBeGreaterThanOrEqual(0);
  });

  it("recommends nothing when the current lineup is already the optimal one", async () => {
    const { model, rosterId, schedule, season } = await fixture();
    const week = startSitWeeks(schedule, season).at(-1)!;
    const input = { season, week, schedule, projections, now: new Date("2026-10-01T00:00:00Z") };
    const first = buildStartSitView(model, rosterId, { ...input, currentStarters: null })!;
    const optimal = first.slots.map((s) => s.player?.playerId ?? "0");
    const second = buildStartSitView(model, rosterId, { ...input, currentStarters: optimal })!;

    expect(second.moves).toEqual([]);
    expect(second.slots.every((s) => !s.isChange)).toBe(true);
    expect(second.currentTotal).toBe(second.optimalTotal);
  });

  it("keeps locked starters in place and never starts a locked bench player", async () => {
    const { model, rosterId, schedule, season } = await fixture();
    const week = startSitWeeks(schedule, season).at(-1)!;
    const input = { season, week, schedule, projections, now: new Date("2027-01-01T00:00:00Z") };
    const { roster } = model.teamsById.get(rosterId)!;
    const active = roster.players.filter((id) => !roster.taxi.includes(id) && !roster.reserve.includes(id));
    const worstFirst = active.slice(-model.format.starterSlots.length);
    const view = buildStartSitView(model, rosterId, { ...input, currentStarters: worstFirst })!;

    expect(view.moves).toEqual([]);
    expect(view.slots.map((s) => s.player?.playerId)).toEqual(worstFirst);
  });
});
