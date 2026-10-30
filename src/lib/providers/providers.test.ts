import { describe, expect, it, vi } from "vitest";
import { analyzeLeagueFormat } from "@/lib/domain/league-format";
import { fetchWithRetry, HttpError } from "@/lib/http/fetch-with-retry";
import { parseMetricCsv, parseValueCsv } from "./csv-import";
import { idpScoringStyle, mapLeagueToStatsGuy } from "./market/stats-guy";
import { resolveSeasons } from "./sleeper/sleeper-client";

function format(rosterPositions: string[], scoringSettings: Record<string, number> = { rec: 1 }, type = 2) {
  return analyzeLeagueFormat({ rosterPositions, scoringSettings, settings: { type }, totalRosters: 12 });
}

describe("Stats Guy format mapping", () => {
  it("maps superflex TE-premium dynasty leagues explicitly", () => {
    const mapping = mapLeagueToStatsGuy(format(["QB", "RB", "WR", "TE", "SUPER_FLEX"], { rec: 1, bonus_rec_te: 0.5 }), { rec: 1, bonus_rec_te: 0.5 });
    expect(mapping.variant).toEqual({ format: "sf_dynasty", tep: "tep", idp: null, idpScoring: null });
  });

  it("uses big TE premium for 2 TE slots and maps IDP depth tiers", () => {
    const positions = ["QB", "TE", "TE", "DL", "DL", "LB", "LB", "DB", "DB"];
    const mapping = mapLeagueToStatsGuy(format(positions), { idp_tkl_solo: 1, idp_sack: 4, idp_int: 3 });
    expect(mapping.variant.tep).toBe("bigtep");
    expect(mapping.variant.idp).toBe("std");
    expect(mapping.variant.format).toBe("non_sf_dynasty");
  });

  it("lists approximations instead of hiding them", () => {
    const mapping = mapLeagueToStatsGuy(format(["QB", "RB"], { rec: 0.5 }, 1), { rec: 0.5 });
    expect(mapping.approximations.join(" ")).toContain("Keeper league");
    expect(mapping.approximations.join(" ")).toContain("Half PPR");
  });

  it("computes the IDP scoring style with the provider's ratio", () => {
    expect(idpScoringStyle({ idp_tkl_solo: 1, idp_sack: 4, idp_tkl_loss: 1, idp_qb_hit: 1, idp_int: 3, idp_pass_def: 1 })).toBe("balanced");
    expect(idpScoringStyle({ idp_tkl_solo: 2, idp_sack: 2 })).toBe("tackle");
    expect(idpScoringStyle({ idp_sack: 6 })).toBe("bigplay");
  });
});

describe("CSV import", () => {
  it("keeps blank values null and separates picks", () => {
    const { values, picks, errors } = parseValueCsv("asset_id,value,valued_at\n4984,,2026-10-20\npick:2027:1:mid,3100,2026-10-20");
    expect(errors).toEqual([]);
    expect(values[0].value).toBeNull();
    expect(picks[0]).toMatchObject({ year: 2027, round: 1, value: 3100 });
  });

  it("rejects invalid rows with row numbers", () => {
    const { errors } = parseValueCsv("asset_id,value,valued_at\n4984,abc,2026-10-20");
    expect(errors[0]).toMatch(/^Row 2/);
  });

  it("validates metric rows and keeps provenance", () => {
    const csv =
      "player_id,metric_key,label,value,units,provider,source_url,season,week_start,week_end,sample_size,definition,denominator,data_cutoff,kind\n" +
      "9509,routes_run,Routes run,,routes,My charting,,2026,1,8,8,Routes on dropbacks,,2026-10-27,manual";
    const { evidence, errors } = parseMetricCsv(csv, "2026-10-28T00:00:00Z");
    expect(errors).toEqual([]);
    expect(evidence[0]).toMatchObject({ value: null, provider: "My charting", kind: "manual", sampleSize: 8, weekEnd: 8 });
  });
});

describe("season resolution", () => {
  it("uses the season being played during the regular season", () => {
    expect(resolveSeasons({ season: "2026", league_season: "2026", season_type: "regular", previous_season: "2025", week: 8 })).toMatchObject({ statsSeason: 2026, defaultLeagueSeason: "2026" });
  });

  it("uses the last played season while new leagues belong to the next one", () => {
    expect(resolveSeasons({ season: "2026", league_season: "2027", season_type: "off", previous_season: "2025", week: 0 })).toMatchObject({ statsSeason: 2025, defaultLeagueSeason: "2027" });
  });
});

describe("HTTP retries", () => {
  it("retries retryable statuses with bounded attempts", async () => {
    const fetchImpl = vi.fn(async () => new Response("busy", { status: 503 }));
    await expect(fetchWithRetry("https://example.test", { retries: 2, fetchImpl, sleep: async () => {} })).rejects.toBeInstanceOf(HttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry client errors", async () => {
    const fetchImpl = vi.fn(async () => new Response("missing", { status: 404 }));
    await expect(fetchWithRetry("https://example.test", { retries: 3, fetchImpl, sleep: async () => {} })).rejects.toMatchObject({ status: 404 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
