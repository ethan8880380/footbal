import { describe, expect, it } from "vitest";
import { analyzeLeagueFormat } from "./league-format";
import { analyzeScoringSupport, scoreStatLine, unsupportedRulesFor } from "./scoring";

const line = { receptions: 5, receiving_yards: 80, receiving_tds: 1, targets: 7 };

describe("league scoring", () => {
  it.each([
    ["PPR", 1, 19],
    ["half PPR", 0.5, 16.5],
    ["standard", 0, 14],
  ])("applies %s reception scoring", (_, rec, expected) => {
    const settings = { rec, rec_yd: 0.1, rec_td: 6 };
    expect(scoreStatLine(line, "WR", settings).points).toBe(expected);
  });

  it("applies TE premium only to tight ends", () => {
    const settings = { rec: 1, rec_yd: 0.1, rec_td: 6, bonus_rec_te: 0.5 };
    expect(scoreStatLine(line, "TE", settings).points).toBe(21.5);
    expect(scoreStatLine(line, "WR", settings).points).toBe(19);
  });

  it("scores per-game threshold bonuses from the game line", () => {
    const settings = { rec_yd: 0.1, bonus_rec_yd_100: 3 };
    expect(scoreStatLine({ receiving_yards: 100 }, "WR", settings).points).toBe(13);
    expect(scoreStatLine({ receiving_yards: 99 }, "WR", settings).points).toBe(9.9);
  });

  it("scores IDP rules from defensive columns", () => {
    const settings = { idp_tkl_solo: 1, idp_tkl_ast: 0.5, idp_sack: 4, idp_int: 3 };
    const points = scoreStatLine({ def_tackles_solo: 6, def_tackle_assists: 2, def_sacks: 1, def_interceptions: 0 }, "LB", settings).points;
    expect(points).toBe(11);
  });

  it("lists unsupported rules and only flags positions they can affect", () => {
    const support = analyzeScoringSupport({ rec: 1, pts_allow_0: 10, rec_td_40p: 2, idp_weird: 1 });
    expect(support.unsupported.map((r) => r.key).sort()).toEqual(["idp_weird", "pts_allow_0", "rec_td_40p"]);
    expect(unsupportedRulesFor(support, "WR").map((r) => r.key)).toEqual(["rec_td_40p"]);
    expect(unsupportedRulesFor(support, "LB").map((r) => r.key).sort()).toEqual(["idp_weird", "rec_td_40p"]);
    expect(scoreStatLine({ receptions: 2 }, "WR", { rec: 1, pts_allow_0: 10 }).isPartial).toBe(false);
  });

  it("ignores zero-weight rules", () => {
    expect(analyzeScoringSupport({ rec: 0, made_up: 0 }).unsupported).toHaveLength(0);
  });
});

describe("league format", () => {
  const base = { totalRosters: 12, scoringSettings: { rec: 1, bonus_rec_te: 0.5 }, settings: { type: 2, taxi_slots: 3, reserve_slots: 2 } };

  it("detects superflex, TE premium, and roster capacity", () => {
    const format = analyzeLeagueFormat({ ...base, rosterPositions: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "SUPER_FLEX", "BN", "BN", "IR", "TAXI"] });
    expect(format.isSuperflex).toBe(true);
    expect(format.tePremium).toBe(0.5);
    expect(format.activeRosterLimit).toBe(10);
    expect(format.taxiSlots).toBe(3);
    expect(format.leagueType).toBe("dynasty");
  });

  it("treats 2QB as superflex-equivalent and counts IDP slots", () => {
    const format = analyzeLeagueFormat({ ...base, rosterPositions: ["QB", "QB", "RB", "WR", "DL", "LB", "DB", "IDP_FLEX", "BN"] });
    expect(format.isSuperflex).toBe(true);
    expect(format.isIdp).toBe(true);
    expect(format.idpStarterSlots).toBe(4);
  });
});
