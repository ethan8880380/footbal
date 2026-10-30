import { describe, expect, it } from "vitest";
import { solveLineup } from "./lineup";
import { canFillSlot, eligiblePositions } from "./positions";

describe("positional eligibility", () => {
  it("maps flexible slots to their positions", () => {
    expect(canFillSlot("SUPER_FLEX", ["QB"])).toBe(true);
    expect(canFillSlot("FLEX", ["QB"])).toBe(false);
    expect(canFillSlot("REC_FLEX", ["RB"])).toBe(false);
    expect(canFillSlot("WRRB_FLEX", ["RB"])).toBe(true);
    expect(canFillSlot("IDP_FLEX", ["LB"])).toBe(true);
  });

  it("normalizes defensive position aliases", () => {
    expect(eligiblePositions(["DE"], "DE")).toEqual(["DL"]);
    expect(eligiblePositions([], "CB")).toEqual(["DB"]);
  });
});

describe("lineup solver", () => {
  it("never uses one player in two slots", () => {
    const result = solveLineup(["QB", "SUPER_FLEX"], [{ playerId: "qb1", positions: ["QB"], score: 100 }]);
    const used = result.assignments.map((a) => a.playerId).filter(Boolean);
    expect(used).toEqual(["qb1"]);
    expect(result.unfilledSlots).toHaveLength(1);
  });

  it("solves overlapping flex slots optimally rather than greedily", () => {
    // Greedy WR-first into REC_FLEX would strand the TE.
    const result = solveLineup(
      ["WRRB_FLEX", "REC_FLEX"],
      [
        { playerId: "wr", positions: ["WR"], score: 90 },
        { playerId: "te", positions: ["TE"], score: 80 },
        { playerId: "rb", positions: ["RB"], score: 10 },
      ],
    );
    expect(result.totalScore).toBe(170);
    expect(Object.fromEntries(result.assignments.map((a) => [a.slot, a.playerId]))).toEqual({ WRRB_FLEX: "wr", REC_FLEX: "te" });
  });

  it("excludes unscored players rather than treating them as zero", () => {
    const result = solveLineup(["RB"], [{ playerId: "x", positions: ["RB"], score: null }]);
    expect(result.excluded).toEqual(["x"]);
    expect(result.unfilledSlots).toEqual(["RB"]);
  });
});
