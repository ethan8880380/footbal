import { z } from "zod";
import calibration from "./advanced-calibration.json";

export const advancedProspectSchema = z.object({
  name: z.string(), position: z.enum(["QB", "RB", "WR", "TE"]), draftYear: z.number().int(),
  school: z.string(), sourceUrl: z.string().url(), capturedAt: z.string(),
  metrics: z.record(z.string(), z.number().finite().nullable()),
});
export type AdvancedProspect = z.infer<typeof advancedProspectSchema>;
export const ADVANCED_CALIBRATION = calibration;
export function advancedKey(name: string, position: string, year: number) {
  return `${year}:${position}:${name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z0-9]/g, "")}`;
}
// Only college performance inputs. Provider ranks, grades, draft picks and NFL finishes are excluded.
export const ADVANCED_INPUTS = {
  WR: [["Y/RR", .40, .8, 3.8], ["T/RR", .20, .10, .32], ["UCTPRR", .20, .07, .23], ["YAC/R", .10, 2, 8], ["Drop%", .10, .12, .02]],
  TE: [["Y/RR", .40, .6, 3.2], ["T/RR", .20, .08, .28], ["UCTPRR", .20, .06, .21], ["YAC/R", .10, 2, 8], ["Drop%", .10, .12, .02]],
  RB: [["MTF/A", .40, .10, .35], ["YCO/A", .40, 2, 4.5], ["RPT", .20, .03, .22]],
  QB: [["ADJ%", .40, .60, .82], ["BTT%", .30, .02, .09], ["TWP%", .30, .06, .01]],
} satisfies Record<string, [string, number, number, number][]>;
export function advancedScore(record: AdvancedProspect | null | undefined) {
  if (!record) return null;
  const components = ADVANCED_INPUTS[record.position].map(([key, weight, low, high]) => {
    const value = record.metrics[key] ?? null;
    return { key, weight, value, score: value === null ? null : Math.max(0, Math.min(100, 100 * (value - low) / (high - low))) };
  });
  const coverage = components.reduce((n, c) => n + (c.score === null ? 0 : c.weight), 0);
  if (coverage < .8) return null;
  return { score: components.reduce((n, c) => n + (c.score ?? 35) * c.weight, 0), coverage, components };
}
export function blendAdvanced(base: number | null, record: AdvancedProspect | null | undefined, weight?: number) {
  const advanced = advancedScore(record);
  const appliedWeight = base !== null && advanced && record ? (weight ?? calibration.weights[record.position]) : 0;
  return { score: base === null ? null : Math.round((base * (1 - appliedWeight) + (advanced?.score ?? 0) * appliedWeight) * 10) / 10, weight: appliedWeight, advanced };
}
export const METRIC_LABELS: Record<string, string> = {
  "Y/RR": "Yards / route", "T/RR": "Targets / route", UCTPRR: "Uncontested targets / route", CTPRR: "Contested targets / route",
  "YAC/R": "Yards after catch / reception", "Drop%": "Drop rate", "CC%": "Contested catch rate", Separation: "Separation proxy",
  "MTF/A": "Missed tackles forced / attempt", "YCO/A": "Yards after contact / attempt", RPT: "Reception share of touches",
  "ADJ%": "Adjusted completion rate", "BTT%": "Big-time throw rate", "TWP%": "Turnover-worthy play rate", aDOT: "Average depth of target",
  ELU: "Elusive rating", "Break %": "Yard share on runs of 15+ yards",
};
export function metricDisplay(key: string, value: number | null) {
  if (value === null) return "—";
  return /%|PRR|T\/RR|^RPT$/.test(key) ? `${(value * 100).toFixed(1)}%` : value.toFixed(2);
}
