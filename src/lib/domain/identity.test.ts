import { describe, expect, it } from "vitest";
import { resolveIdentities } from "./identity";

describe("identity joins", () => {
  it("joins through the crosswalk Sleeper ID and fills PFR from nflverse by GSIS", () => {
    const { identities, issues } = resolveIdentities(
      [{ playerId: "100", gsisId: null, sportradarId: null }],
      [{ sleeperId: "100", gsisId: "00-001", pfrId: null, sportradarId: "sr-1" }],
      [{ gsisId: "00-001", pfrId: "DoeJo00" }],
      new Set(["100"]),
    );
    expect(identities[0]).toMatchObject({ gsisId: "00-001", pfrId: "DoeJo00", resolvedVia: "crosswalk:sleeper_id" });
    expect(issues).toHaveLength(0);
  });

  it("falls back to a unique Sportradar ID match", () => {
    const { identities } = resolveIdentities(
      [{ playerId: "200", gsisId: null, sportradarId: "sr-2" }],
      [{ sleeperId: null, gsisId: "00-002", pfrId: "RoeJa00", sportradarId: "sr-2" }],
      [],
      new Set(),
    );
    expect(identities[0]).toMatchObject({ gsisId: "00-002", pfrId: "RoeJa00", resolvedVia: "crosswalk:sportradar_id" });
  });

  it("never merges by name and records an unresolved issue instead", () => {
    const { identities, issues } = resolveIdentities(
      [{ playerId: "300", gsisId: null, sportradarId: null }],
      [{ sleeperId: "999", gsisId: "00-003", pfrId: null, sportradarId: null }],
      [],
      new Set(["300"]),
    );
    expect(identities[0].gsisId).toBeNull();
    expect(issues).toEqual([expect.objectContaining({ sleeperId: "300", kind: "unresolved" })]);
  });

  it("leaves conflicting GSIS IDs unresolved and reports the conflict", () => {
    const { identities, issues } = resolveIdentities(
      [{ playerId: "400", gsisId: "00-AAA", sportradarId: null }],
      [{ sleeperId: "400", gsisId: "00-BBB", pfrId: null, sportradarId: null }],
      [],
      new Set(["400"]),
    );
    expect(identities[0].gsisId).toBeNull();
    expect(issues[0].kind).toBe("gsis_conflict");
  });

  it("reports a crosswalk that maps one Sleeper ID to several GSIS IDs", () => {
    const { identities, issues } = resolveIdentities(
      [{ playerId: "500", gsisId: null, sportradarId: null }],
      [
        { sleeperId: "500", gsisId: "00-1", pfrId: null, sportradarId: null },
        { sleeperId: "500", gsisId: "00-2", pfrId: null, sportradarId: null },
      ],
      [],
      new Set(["500"]),
    );
    expect(identities[0].gsisId).toBeNull();
    expect(issues[0].kind).toBe("crosswalk_conflict");
  });
});
