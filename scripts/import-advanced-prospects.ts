import { readFile, writeFile } from "node:fs/promises";
import { advancedProspectSchema, advancedKey, type AdvancedProspect } from "../src/lib/domain/advanced-prospects";
import { setAppState } from "../src/lib/db/repositories/settings-repository";

async function main() {
  const snapshots = JSON.parse(await readFile(process.argv[2] ?? "data/bakery-advanced/snapshots.json", "utf8")) as { position: string; capturedAt: string; headers: string[]; rows: { cells: string[]; href: string }[] }[];
  const records: AdvancedProspect[] = [];
  for (const snapshot of snapshots) for (const row of snapshot.rows) {
    const fields = Object.fromEntries(snapshot.headers.map((key, i) => [key.trim().replace("Drop %", "Drop%"), row.cells[i]]));
    const metrics: Record<string, number | null> = {};
    for (const [key, text] of Object.entries(fields).slice(8)) {
      const clean = text?.replaceAll(",", "").replace("%", "").trim();
      const value = clean && /^-?\d+(\.\d+)?$/.test(clean) ? Number(clean) : null;
      metrics[key] = value !== null && text.includes("%") ? value / 100 : value;
    }
    records.push(advancedProspectSchema.parse({ name: fields.Player, school: fields.School, position: snapshot.position, draftYear: Number(fields.Class), sourceUrl: row.href, capturedAt: snapshot.capturedAt, metrics }));
  }
  const keys = records.map(r => advancedKey(r.name, r.position, r.draftYear));
  if (new Set(keys).size !== records.length) throw new Error("Ambiguous duplicate player keys; resolve before importing");
  await writeFile("data/bakery-advanced/records.json", JSON.stringify(records, null, 2));
  await setAppState("college-advanced:v1", records);
  console.log(`Imported ${records.length} advanced profiles`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
