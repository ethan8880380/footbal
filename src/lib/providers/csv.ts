import Papa from "papaparse";

export function parseCsv(text: string): Record<string, string>[] {
  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  return result.data;
}

/** Empty strings and "NA" are missing values, never zero. */
export function num(value: string | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "NA" || trimmed === "NaN") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function str(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" || trimmed === "NA" ? null : trimmed;
}
