import { describe, expect, it } from "vitest";
import { advisorRequestSchema, validateSelection, type AdvisorCard } from "./advisor";

const cards: AdvisorCard[] = [{ id: "trade", title: "Trade", facts: [{ id: "value", text: "Verified", href: "/report" }], risks: ["Limited evidence"], href: "/trade", proposal: null, sends: [], receives: [] }];
describe("advisor selection boundary", () => {
  it("keeps verified facts, links and risks intact", () => {
    expect(validateSelection({ choices: [{ id: "trade", evidenceIds: ["value"] }] }, cards)).toEqual(cards);
  });
  it("rejects invented options, cross-card evidence, duplicates and added prose", () => {
    for (const choices of [
      [{ id: "invented", evidenceIds: ["value"] }],
      [{ id: "trade", evidenceIds: ["unknown"] }],
      [{ id: "trade", evidenceIds: [] }],
      [{ id: "trade", evidenceIds: ["value", "value"] }],
      [{ id: "trade", evidenceIds: ["value"] }, { id: "trade", evidenceIds: ["value"] }],
      [{ id: "trade", evidenceIds: ["value"], text: "Guaranteed win" }],
    ]) expect(validateSelection({ choices }, cards)).toBeNull();
  });
  it("requires a complete bounded counteroffer request", () => {
    expect(advisorRequestSchema.safeParse({ mode: "counter" }).success).toBe(false);
    expect(advisorRequestSchema.safeParse({ mode: "trades", position: "invented" }).success).toBe(false);
    expect(advisorRequestSchema.safeParse({ mode: "team" }).success).toBe(true);
  });
});
