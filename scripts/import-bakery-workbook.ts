import { writeFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { bakeryGradeSchema, type BakeryGrade } from "../src/lib/domain/bakery-grades";

/** Usage: pnpm bakery:import "<path to workbook>.xlsx". Reads each position's "Overall" tab. */
const SHEETS = { QB: "QB Overall", RB: "RB Overall", WR: "WR Overall", TE: "TE Overall" } as const;

function main() {
  const path = process.argv[2];
  if (!path) throw new Error("Pass the workbook path as the first argument.");
  const workbook = XLSX.readFile(path);
  const grades: BakeryGrade[] = [];
  for (const [position, sheet] of Object.entries(SHEETS)) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheet], { header: 1, defval: null });
    const header = rows[1] as string[];
    const column = (name: string) => header.indexOf(name);
    for (const row of rows.slice(2)) {
      const name = row[column("Player Name")], year = row[column("Year")], grade = row[column(`${position} Grade`)], overall = row[column("Overall")];
      if (typeof name !== "string" || typeof year !== "number" || typeof grade !== "number" || typeof overall !== "number") continue;
      grades.push(bakeryGradeSchema.parse({ name, position, draftYear: year, school: row[column("School")] ?? "", tier: row[column("Tier")] ?? "", grade, overall, zScore: row[column("Z-Score")] ?? null, draftAge: row[column("Draft Age")] ?? null }));
    }
  }
  return writeFile("src/lib/data/bakery-grades.json", JSON.stringify(grades) + "\n").then(() => console.log(`${grades.length} grades written`));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
