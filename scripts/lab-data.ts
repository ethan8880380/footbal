import { readFile, writeFile } from "node:fs/promises";
import Papa from "papaparse";
import historical from "../src/lib/data/historical-prospects.json";
import { buildCollegeBoard, type CollegeBoardRow, type CollegePlayer } from "../src/lib/domain/college-model";
import type { Prospect } from "../src/lib/domain/prospects";
import type { ProspectHistory } from "../src/lib/domain/historical-prospects";
import type { AdvancedProspect } from "../src/lib/domain/advanced-prospects";
import { labValues, type Measurements } from "../src/lib/domain/prospect-lab";

export interface LabRecord { row: CollegeBoardRow; values: Measurements; outcome: number }

/** Join archived pre-draft measurements and build every complete 2016–2023 observation. */
export async function loadLabRecords(): Promise<LabRecord[]> {
  const csv = async (file: string) => Papa.parse<Record<string, string>>(await readFile(file, "utf8"), { header: true, skipEmptyLines: true }).data;
  const players = await csv("data/backtest/players.csv"), combine = await csv("data/backtest/combine.csv");
  const entries = historical.entries as { prospect: Prospect; college: CollegePlayer; history: ProspectHistory }[];
  if (entries.some(e => e.college.seasons.some(s => s.year >= e.prospect.draftYear))) throw new Error("Post-draft college season in research dataset");
  const measurements: Record<string, Measurements> = {};
  for (const e of entries) {
    const id = e.prospect.id.replace(/^historical-\d+-/, "");
    const player = players.find(p => p.gsis_id === id);
    const found = player?.pfr_id ? combine.filter(c => c.pfr_id === player.pfr_id && Number(c.season) <= e.prospect.draftYear && Number(c.draft_year) === e.prospect.draftYear) : [];
    const c = found.length === 1 ? found[0] : undefined;
    const m: Measurements = {};
    if (player?.birth_date) { const dob = Date.parse(player.birth_date), age = (Date.UTC(e.prospect.draftYear, 4, 1) - dob) / (365.25 * 86400000); if (age >= 18 && age <= 35) m.age = age; }
    if (c) {
      for (const key of ["forty", "vertical", "broad_jump", "cone", "shuttle", "bench"]) m[key] = c[key] !== "" && Number.isFinite(Number(c[key])) ? Number(c[key]) : null;
      m.weight = Number(c.wt) || null;
      const ht = /^(\d+)-(\d+)$/.exec(c.ht); m.height = ht ? Number(ht[1]) * 12 + Number(ht[2]) : null;
      m.bmi = m.weight && m.height ? 703 * m.weight / m.height ** 2 : null;
      m.speedScore = m.weight && m.forty ? 200 * m.weight / m.forty ** 4 : null;
    }
    measurements[e.prospect.id] = m;
  }
  await writeFile("src/lib/data/prospect-measurements.json", JSON.stringify(measurements));
  const advanced: AdvancedProspect[] = JSON.parse(await readFile("data/bakery-advanced/records.json", "utf8"));
  const histories = Object.fromEntries(entries.map(e => [e.prospect.id, e.history]));
  const board = buildCollegeBoard(entries.map(e => e.prospect), entries.map(e => e.college), "sf", advanced, histories).map(r => ({ ...r, history: histories[r.id] }));
  return board.filter(r => r.history.complete && r.overall !== null && r.draftYear <= 2023).map(r => ({ row: r as CollegeBoardRow, values: labValues(r, measurements[r.id]), outcome: r.history.nflPpr }));
}
