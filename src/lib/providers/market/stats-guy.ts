import { z } from "zod";
import { fetchJson } from "@/lib/http/fetch-with-retry";
import type { LeagueFormat } from "@/lib/domain/league-format";

export const STATS_GUY = {
  id: "statsguy",
  label: "Stats Guy Fantasy",
  api: "https://api.statsguyfantasy.com/api/v1",
  docs: "https://statsguyfantasy.com/developers/docs",
  attribution: { label: "Data from Stats Guy Fantasy", url: "https://statsguyfantasy.com" },
  minIntervalMs: 1_100,
};

export interface StatsGuyVariant {
  format: "sf_dynasty" | "non_sf_dynasty" | "sf_redraft" | "non_sf_redraft";
  tep: "std" | "tep" | "bigtep";
  idp: "light" | "std" | "heavy" | null;
  idpScoring: "tackle" | "balanced" | "bigplay" | null;
}

export interface MarketMapping {
  variant: StatsGuyVariant;
  variantKey: string;
  approximations: string[];
}

export function variantKey(v: StatsGuyVariant) {
  return [v.format, v.tep, v.idp ?? "no-idp", v.idpScoring ?? "-"].join("|");
}

export function mapLeagueToStatsGuy(format: LeagueFormat, scoring: Record<string, number>): MarketMapping {
  const approximations: string[] = [];
  const dynasty = format.leagueType !== "redraft";
  if (format.leagueType === "keeper") approximations.push("Keeper league priced with dynasty values.");
  if (format.leagueType === "unknown") approximations.push("League type unknown; priced with dynasty values.");
  if (!format.isSuperflex && format.qbStarterSlots === 0) approximations.push("No QB starting slot; priced as single-QB.");
  if (format.qbStarterSlots >= 2 && !format.starterSlots.includes("SUPER_FLEX")) approximations.push("2QB league priced as superflex.");

  const sf = format.isSuperflex;
  const formatKey = `${sf ? "sf" : "non_sf"}_${dynasty ? "dynasty" : "redraft"}` as StatsGuyVariant["format"];

  const tep: StatsGuyVariant["tep"] =
    format.tePremium > 1 || format.tightEndStarterSlots >= 2 ? "bigtep" : format.tePremium > 0 ? "tep" : "std";

  let idp: StatsGuyVariant["idp"] = null;
  let idpScoring: StatsGuyVariant["idpScoring"] = null;
  if (format.isIdp) {
    if (!dynasty) {
      approximations.push("IDP values exist for dynasty formats only; defenders are unvalued in this league.");
    } else {
      idp = format.idpStarterSlots >= 10 ? "heavy" : format.idpStarterSlots >= 5 ? "std" : "light";
      idpScoring = idpScoringStyle(scoring);
    }
  }

  approximations.push(`Values blend scoring systems; ${format.scoringLabel} scoring is not priced separately.`);
  if (format.teams && format.teams !== 12) approximations.push(`Values are not adjusted for ${format.teams}-team leagues.`);

  const variant = { format: formatKey, tep, idp, idpScoring };
  return { variant, variantKey: variantKey(variant), approximations };
}

/** Provider definition: (solo + sack + TFL + QB hit + INT + PD) / solo, with idp_tkl added to both solo terms. */
export function idpScoringStyle(scoring: Record<string, number>): NonNullable<StatsGuyVariant["idpScoring"]> {
  const tackle = scoring.idp_tkl ?? 0;
  const solo = (scoring.idp_tkl_solo ?? 0) + tackle;
  const bigPlays = (scoring.idp_sack ?? 0) + (scoring.idp_tkl_loss ?? 0) + (scoring.idp_qb_hit ?? 0) + (scoring.idp_int ?? 0) + (scoring.idp_pass_def ?? 0);
  if (solo <= 0) return bigPlays > 0 ? "bigplay" : "balanced";
  const ratio = (solo + bigPlays) / solo;
  return ratio < 8 ? "tackle" : ratio <= 13 ? "balanced" : "bigplay";
}

const formatMap = z.record(z.string(), z.number().nullable()).nullish();

const playerCardSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string().nullish(),
  url: z.string().nullish(),
  position: z.string().nullish(),
  value: formatMap,
  rank: formatMap,
  positionRank: formatMap,
  valueChange: z.record(z.string(), z.object({ days7: z.number().nullish(), days30: z.number().nullish() }).nullable()).nullish(),
  dataUpdatedAt: z.string().nullish(),
});

const playersResponseSchema = z.object({
  total: z.number(),
  valuesAsOf: z.record(z.string(), z.string().nullable()).nullish(),
  idpAsOf: z.string().nullish(),
  players: z.array(playerCardSchema),
});

const picksResponseSchema = z.object({
  valuesAsOf: z.record(z.string(), z.string().nullable()).nullish(),
  picks: z.array(
    z.object({
      id: z.string(),
      year: z.number(),
      round: z.number(),
      slot: z.number().nullish(),
      variant: z.string().nullish(),
      value: formatMap,
    }),
  ),
});

const historySchema = z.object({
  history: z.array(z.object({ date: z.string(), value: z.number().nullable() })),
});

let lastRequestAt = 0;
async function throttled<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const wait = lastRequestAt + STATS_GUY.minIntervalMs - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
  return schema.parse(await fetchJson<unknown>(`${STATS_GUY.api}${path}`, { retries: 3, baseDelayMs: 2_000 }));
}

function query(variant: StatsGuyVariant, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ tep: variant.tep, ...extra });
  if (variant.idp) params.set("idp", variant.idp);
  if (variant.idp && variant.idpScoring) params.set("idpScoring", variant.idpScoring);
  return params.toString();
}

export async function fetchStatsGuyPlayers(variant: StatsGuyVariant) {
  const path = `/players?${query(variant)}`;
  const data = await throttled(path, playersResponseSchema);
  const valuedAt = data.valuesAsOf?.[variant.format] ?? null;
  return {
    sourceUrl: `${STATS_GUY.api}${path}`,
    valuedAt: variant.idp && data.idpAsOf && valuedAt ? [valuedAt, data.idpAsOf].sort()[0] : valuedAt,
    players: data.players.map((p) => ({
      playerId: p.id,
      value: p.value?.[variant.format] ?? null,
      rank: p.rank?.[variant.format] ?? null,
      positionRank: p.positionRank?.[variant.format] ?? null,
      change7d: p.valueChange?.[variant.format]?.days7 ?? null,
      change30d: p.valueChange?.[variant.format]?.days30 ?? null,
      metadataUpdatedAt: p.dataUpdatedAt ?? null,
      url: p.url ?? null,
    })),
  };
}

export async function fetchStatsGuyPicks(variant: StatsGuyVariant) {
  const path = "/picks";
  const data = await throttled(path, picksResponseSchema);
  return {
    sourceUrl: `${STATS_GUY.api}${path}`,
    valuedAt: data.valuesAsOf?.[variant.format] ?? null,
    picks: data.picks.map((p) => ({
      pickId: p.id,
      year: p.year,
      round: p.round,
      slot: p.slot ?? null,
      variant: p.variant ?? null,
      value: p.value?.[variant.format] ?? null,
    })),
  };
}

export async function fetchStatsGuyHistory(playerId: string, variant: StatsGuyVariant, window = 120) {
  const path = `/players/${encodeURIComponent(playerId)}/value-history?${query(variant, { format: variant.format, window: String(window) })}`;
  const data = await throttled(path, historySchema);
  return data.history;
}
