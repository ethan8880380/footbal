import Papa from "papaparse";
import { prospectSchema, type Prospect } from "@/lib/domain/prospects";

export const PROSPECT_COLUMNS = ["id", "name", "school", "position", "draftYear", "rank", "tier", "overall", "grade", "zScore", "height", "weight", "forty", "draftAge", "projection", "source", "sourceUrl", "asOf"] as const;
const numeric = new Set(["draftYear", "rank", "overall", "grade", "zScore", "weight", "forty", "draftAge"]);
export const PROSPECT_TEMPLATE = PROSPECT_COLUMNS.join(",") + "\n";

export function parseProspectCsv(text: string) {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy", transformHeader: h => h.trim() });
  const errors = parsed.errors.map(e => `Row ${(e.row ?? 0) + 2}: ${e.message}`);
  const rows: Prospect[] = [];
  const seen = new Set<string>();
  if (!parsed.data.length) errors.push("No prospects found.");
  if (parsed.data.length > 5000) return { rows, errors: ["Import up to 5,000 prospects at a time."] };
  for (const [index, raw] of parsed.data.entries()) {
    const record = Object.fromEntries(Object.entries(raw).map(([key, value]) => {
      const cleaned = typeof value === "string" ? value.trim() : "";
      return [key, numeric.has(key) ? (!cleaned || cleaned === "NA" || cleaned === "—" ? null : Number(cleaned)) : cleaned];
    }));
    const result = prospectSchema.safeParse(record);
    if (!result.success) {
      errors.push(`Row ${index + 2}: ${result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
      continue;
    }
    const key = `${result.data.draftYear}:${result.data.id}`;
    if (seen.has(key)) errors.push(`Row ${index + 2}: duplicate prospect ${result.data.name}.`);
    seen.add(key);
    rows.push(result.data);
  }
  return { rows, errors };
}
