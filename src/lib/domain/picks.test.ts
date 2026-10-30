import { describe, expect, it } from "vitest";
import { buildPickInventory, pickKey } from "./picks";

const rosterIds = ["1", "2", "3", "4"];

describe("pick inventory", () => {
  it("keeps the original roster when ownership changes", () => {
    const inventory = buildPickInventory({
      leagueSeason: "2026",
      rosterIds,
      drafts: [
        { draftId: "d26", season: "2026", status: "complete", rounds: 3, slotToRosterId: null },
        { draftId: "d27", season: "2027", status: "pre_draft", rounds: 3, slotToRosterId: null },
      ],
      tradedPicks: [{ season: "2027", round: 1, originalRosterId: "3", ownerRosterId: "1", previousOwnerRosterId: "3" }],
      defaultRounds: 3,
      confirmedSeasons: [],
      manualDraftSlots: {},
    });
    const traded = inventory.picks.find((p) => p.key === pickKey("2027", 1, "3"));
    expect(traded).toMatchObject({ originalRosterId: "3", ownerRosterId: "1" });
    expect(inventory.picks.filter((p) => p.season === "2027")).toHaveLength(12);
    expect(inventory.picks.filter((p) => p.ownerRosterId === "1" && p.season === "2027")).toHaveLength(4);
  });

  it("does not treat traded picks as the complete inventory", () => {
    const inventory = buildPickInventory({
      leagueSeason: "2026",
      rosterIds,
      drafts: [{ draftId: "d26", season: "2026", status: "complete", rounds: 3, slotToRosterId: null }],
      tradedPicks: [{ season: "2027", round: 2, originalRosterId: "2", ownerRosterId: "4", previousOwnerRosterId: null }],
      defaultRounds: 3,
      confirmedSeasons: [],
      manualDraftSlots: {},
    });
    // 2027 is confirmed by the traded pick; every roster still gets its own base picks.
    expect(inventory.picks.filter((p) => p.season === "2027")).toHaveLength(12);
    expect(inventory.seasons.find((s) => s.season === "2026")?.status).toBe("consumed");
  });

  it("excludes unconfirmed seasons until confirmed manually", () => {
    const input = {
      leagueSeason: "2026",
      rosterIds,
      drafts: [{ draftId: "d26", season: "2026", status: "complete", rounds: 3, slotToRosterId: null }],
      tradedPicks: [],
      defaultRounds: 3,
      manualDraftSlots: {},
    };
    expect(buildPickInventory({ ...input, confirmedSeasons: [] }).picks).toHaveLength(0);
    const confirmed = buildPickInventory({ ...input, confirmedSeasons: ["2027", "2028"] });
    expect(new Set(confirmed.picks.map((p) => p.season))).toEqual(new Set(["2027", "2028"]));
  });

  it("excludes ambiguous traded picks and in-progress drafts", () => {
    const inventory = buildPickInventory({
      leagueSeason: "2026",
      rosterIds,
      drafts: [
        { draftId: "d26", season: "2026", status: "drafting", rounds: 3, slotToRosterId: null },
        { draftId: "d27", season: "2027", status: "pre_draft", rounds: 2, slotToRosterId: null },
      ],
      tradedPicks: [{ season: "2027", round: 5, originalRosterId: "1", ownerRosterId: "2", previousOwnerRosterId: null }],
      defaultRounds: 2,
      confirmedSeasons: [],
      manualDraftSlots: {},
    });
    expect(inventory.seasons.find((s) => s.season === "2026")?.status).toBe("in_progress");
    expect(inventory.picks.some((p) => p.season === "2026")).toBe(false);
    expect(inventory.excluded).toHaveLength(1);
  });

  it("uses confirmed draft slots and otherwise leaves the slot unknown", () => {
    const inventory = buildPickInventory({
      leagueSeason: "2027",
      rosterIds,
      drafts: [{ draftId: "d27", season: "2027", status: "pre_draft", rounds: 1, slotToRosterId: { "1": "4", "2": "3" } }],
      tradedPicks: [],
      defaultRounds: 1,
      confirmedSeasons: [],
      manualDraftSlots: { "1": 3 },
    });
    expect(inventory.picks.find((p) => p.originalRosterId === "4")).toMatchObject({ slot: 1, slotSource: "draft" });
    expect(inventory.picks.find((p) => p.originalRosterId === "1")).toMatchObject({ slot: 3, slotSource: "manual" });
    expect(inventory.picks.find((p) => p.originalRosterId === "2")?.slot).toBeNull();
  });
});
