import { z } from "zod";
import type { Evidence, MarketPickRecord, MarketValueRecord } from "@/lib/domain/types";
import { parseCsv } from "./csv";

const optionalNumber = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v.trim() === "" || v.trim().toUpperCase() === "NA") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: `"${v}" is not a number` });
      return z.NEVER;
    }
    return n;
  });
const optionalText = z.string().optional().transform((v) => (v && v.trim() ? v.trim() : null));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Use YYYY-MM-DD");

const valueRow = z.object({
  asset_id: z.string().trim().min(1, "asset_id is required"),
  value: optionalNumber,
  valued_at: isoDate,
});

const metricRow = z.object({
  player_id: z.string().trim().min(1, "player_id is required"),
  metric_key: z.string().trim().regex(/^[a-z0-9_]+$/, "metric_key must be snake_case"),
  label: z.string().trim().min(1),
  value: optionalNumber,
  units: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  source_url: optionalText,
  season: optionalNumber,
  week_start: optionalNumber,
  week_end: optionalNumber,
  sample_size: optionalNumber,
  definition: z.string().trim().min(1),
  denominator: optionalText,
  data_cutoff: optionalText,
  kind: z.enum(["observed", "calculated", "projected", "manual"]).optional().default("manual"),
});

export const CSV_TEMPLATES = {
  values: "asset_id,value,valued_at\n4984,8200,2026-10-20\npick:2027:1:mid,3100,2026-10-20",
  metrics:
    "player_id,metric_key,label,value,units,provider,source_url,season,week_start,week_end,sample_size,definition,denominator,data_cutoff,kind\n" +
    "9509,routes_run,Routes run,212,routes,My charting,,2026,1,8,8,Routes run on dropbacks,,2026-10-27,manual",
};

export interface CsvResult<T> {
  rows: T[];
  errors: string[];
}

function validate<S extends z.ZodType>(text: string, schema: S): CsvResult<z.infer<S>> {
  const records = parseCsv(text);
  const rows: z.infer<S>[] = [];
  const errors: string[] = [];
  if (records.length === 0) errors.push("No rows found.");
  records.forEach((record, index) => {
    const parsed = schema.safeParse(record);
    if (parsed.success) rows.push(parsed.data);
    else errors.push(`Row ${index + 2}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "row"} ${i.message}`).join("; ")}`);
  });
  return { rows, errors };
}

export function parseValueCsv(text: string) {
  const { rows, errors } = validate(text, valueRow);
  const values: MarketValueRecord[] = [];
  const picks: MarketPickRecord[] = [];
  for (const row of rows) {
    if (row.asset_id.startsWith("pick:")) {
      const [, year, round, variant] = row.asset_id.split(":");
      if (!year || !round) {
        errors.push(`Pick "${row.asset_id}" must look like pick:2027:1:mid.`);
        continue;
      }
      picks.push({ pickId: row.asset_id, year: Number(year), round: Number(round), slot: null, variant: variant ?? null, value: row.value });
    } else {
      values.push({ playerId: row.asset_id, value: row.value, rank: null, positionRank: null, change7d: null, change30d: null, url: null });
    }
  }
  const valuedAt = rows.map((r) => r.valued_at).sort().at(-1) ?? null;
  return { values, picks, valuedAt, errors };
}

export function parseMetricCsv(text: string, retrievedAt: string) {
  const { rows, errors } = validate(text, metricRow);
  const evidence: Evidence[] = rows.map((row) => ({
    id: `csv:${row.metric_key}:${row.player_id}:${row.season ?? "na"}:${row.week_start ?? "na"}-${row.week_end ?? "na"}`,
    playerId: row.player_id,
    metricKey: row.metric_key,
    label: row.label,
    value: row.value,
    units: row.units,
    provider: row.provider,
    sourceUrl: row.source_url,
    season: row.season,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    dateRange: null,
    sampleSize: row.sample_size,
    sampleUnit: null,
    definition: row.definition,
    denominator: row.denominator,
    dataCutoff: row.data_cutoff,
    retrievedAt,
    kind: row.kind,
  }));
  return { evidence, errors };
}
