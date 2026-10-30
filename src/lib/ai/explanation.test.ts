import { describe, expect, it } from "vitest";
import { explanationCacheKey, validateExplanation, type EvidencePacket } from "./explanation";

const packet: EvidencePacket = {
  version: "test",
  player: { id: "100", name: "Test Player", position: "WR", team: "AAA" },
  league: { name: "League", scoring: "PPR", lineup: "QB, 2 RB", strategy: "Balanced", superflex: true, tePremium: 0 },
  deterministic: { recommendation: "keep", evidenceStrength: "Strong evidence", strengths: [], concerns: [], changeTriggers: [] },
  facts: [
    { id: "nflverse:target_share:100:2026:season", label: "Target share", value: 24.5, units: "%", window: "2026 weeks 1-7", sample: "7 games played", provider: "nflverse", kind: "calculated", cutoff: "2026-10-26" },
    { id: "statsguy:value:100", label: "Market value", value: 6200, units: "value", window: null, sample: null, provider: "Stats Guy", kind: "observed", cutoff: "2026-10-28" },
  ],
  knownPlayers: [],
  missing: [],
};

function response(overrides: Record<string, unknown> = {}) {
  return {
    recommendation: "keep",
    summary: "He earns 24.5% of targets and holds a 6,200 market value.",
    reasons: [{ text: "Target share of 24.5% over 7 games.", evidenceIds: ["nflverse:target_share:100:2026:season"] }],
    counterarguments: [{ text: "Market value already reflects the role.", evidenceIds: ["statsguy:value:100"] }],
    uncertainty: "Seven games is a moderate sample.",
    mentionedPlayerIds: ["100"],
    ...overrides,
  };
}

describe("AI explanation validation", () => {
  it("accepts a response that cites only supplied evidence and numbers", () => {
    const result = validateExplanation(response(), packet);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("rejects citations that are not in the packet", () => {
    const result = validateExplanation(response({ reasons: [{ text: "Strong usage.", evidenceIds: ["pff:grade:100"] }] }), packet);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("pff:grade:100");
  });

  it("rejects reasons without citations", () => {
    expect(validateExplanation(response({ reasons: [{ text: "Strong usage.", evidenceIds: [] }] }), packet).ok).toBe(false);
  });

  it("rejects invented numbers, URLs, unknown players, and changed recommendations", () => {
    expect(validateExplanation(response({ summary: "He should score 18.7 points per game." }), packet).ok).toBe(false);
    expect(validateExplanation(response({ uncertainty: "See https://example.com" }), packet).ok).toBe(false);
    expect(validateExplanation(response({ mentionedPlayerIds: ["999"] }), packet).ok).toBe(false);
    expect(validateExplanation(response({ recommendation: "shop" }), packet).ok).toBe(false);
  });

  it("rejects malformed responses", () => {
    expect(validateExplanation({ summary: "missing fields" }, packet).ok).toBe(false);
  });
});

describe("explanation cache key", () => {
  const input = {
    playerId: "100",
    league: { scoringSettings: { rec: 1, pass_td: 4 }, rosterPositions: ["QB", "RB"], settings: { type: 2 } },
    config: { strategy: "balanced", myRosterId: "1", consolidationExponent: 1.35 },
    facts: packet.facts,
    model: { provider: "openai", model: "m", baseUrl: null, promptVersion: "v1" },
  };

  it("is stable for identical inputs regardless of key order", () => {
    const reordered = { ...input, league: { ...input.league, scoringSettings: { pass_td: 4, rec: 1 } } };
    expect(explanationCacheKey(reordered)).toBe(explanationCacheKey(input));
  });

  it("changes when league settings, strategy, evidence, or model change", () => {
    const base = explanationCacheKey(input);
    expect(explanationCacheKey({ ...input, league: { ...input.league, scoringSettings: { rec: 0.5, pass_td: 4 } } })).not.toBe(base);
    expect(explanationCacheKey({ ...input, league: { ...input.league, rosterPositions: ["QB", "RB", "SUPER_FLEX"] } })).not.toBe(base);
    expect(explanationCacheKey({ ...input, config: { ...input.config, strategy: "rebuilding" } })).not.toBe(base);
    expect(explanationCacheKey({ ...input, facts: [{ ...packet.facts[0], value: 25 }, packet.facts[1]] })).not.toBe(base);
    expect(explanationCacheKey({ ...input, model: { ...input.model, model: "other" } })).not.toBe(base);
  });
});
