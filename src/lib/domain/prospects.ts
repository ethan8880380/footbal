import { z } from "zod";

const nullableNumber = z.number().finite().nullable().default(null);
export const prospectSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(150),
  school: z.string().min(1).max(150),
  position: z.enum(["QB", "RB", "WR", "TE", "DL", "LB", "DB"]),
  draftYear: z.number().int().min(2000).max(2100),
  rank: z.number().int().positive(),
  tier: z.string().max(80).default("Unranked"),
  overall: z.number().min(0).max(100).nullable().default(null),
  grade: nullableNumber,
  zScore: nullableNumber,
  height: z.string().max(20).default(""),
  weight: z.number().positive().nullable().default(null),
  forty: z.number().positive().nullable().default(null),
  draftAge: z.number().min(16).max(40).nullable().default(null),
  projection: z.string().max(80).default(""),
  source: z.string().min(1).max(100),
  sourceUrl: z.url().refine(v => /^https?:\/\//.test(v), "Use an HTTP(S) source URL"),
  asOf: z.iso.date(),
});
export type Prospect = z.infer<typeof prospectSchema>;
export type ProspectSort = "rank" | "overall" | "grade" | "zScore" | "draftAge" | "weight" | "forty";

export function sortProspects<T extends Prospect>(rows: T[], key: ProspectSort, descending: boolean): T[] {
  return [...rows].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av === null && bv === null) return a.rank - b.rank;
    if (av === null) return 1;
    if (bv === null) return -1;
    return (av - bv) * (descending ? -1 : 1) || a.rank - b.rank || a.name.localeCompare(b.name);
  });
}

export function prospectPick(rank: number, teams: number) {
  return `${Math.floor((rank - 1) / teams) + 1}.${String((rank - 1) % teams + 1).padStart(2, "0")}`;
}

export function mergeProspects(existing: Prospect[], incoming: Prospect[]) {
  const rows = new Map(existing.map(row => [`${row.draftYear}:${row.id}`, row]));
  for (const row of incoming) rows.set(`${row.draftYear}:${row.id}`, row);
  return [...rows.values()];
}
