import { describe, expect, it } from "vitest";
import { mergeProspects, prospectPick, prospectSchema, sortProspects } from "./prospects";
import { parseProspectCsv } from "../providers/prospect-csv";
import { createTestDb } from "../db/client";
import { getCollegeProspects, saveCollegeProspects } from "../db/repositories/prospect-repository";

const player = prospectSchema.parse({ id: "sample", name: "Sample Player", school: "Example", position: "WR", draftYear: 2027, rank: 1, overall: 90, source: "Test fixture", sourceUrl: "https://example.com", asOf: "2026-10-28" });
const header = "id,name,school,position,draftYear,rank,overall,source,sourceUrl,asOf";
const csv = `${header}\nsample,Sample Player,Example,WR,2027,1,90,Test fixture,https://example.com,2026-10-28`;

describe("prospect imports and analysis", () => {
  it("preserves missing metrics instead of inventing zeroes", () => {
    const result = parseProspectCsv(csv.replace(",90,", ",,"));
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ overall: null, grade: null, zScore: null });
  });
  it("rejects malformed CSV, duplicate players, unsafe URLs and invalid classes", () => {
    expect(parseProspectCsv(`${csv}\n${csv.split("\n")[1]}`).errors.join()).toContain("duplicate");
    expect(parseProspectCsv(csv.replace("https://example.com", "javascript:alert(1)")).errors.length).toBeGreaterThan(0);
    expect(parseProspectCsv(csv.replace("2027", "freshman")).errors.length).toBeGreaterThan(0);
    expect(parseProspectCsv(`${csv},extra`).errors.length).toBeGreaterThan(0);
    expect(parseProspectCsv(header).errors.length).toBeGreaterThan(0);
  });
  it("places missing values last in either sort direction without changing source ranks", () => {
    const rows = [player, { ...player, id: "missing", rank: 2, overall: null }, { ...player, id: "lower", rank: 3, overall: 0 }];
    expect(sortProspects(rows, "overall", false).map(r => r.id)).toEqual(["lower", "sample", "missing"]);
    expect(sortProspects(rows, "overall", true).map(r => r.id)).toEqual(["sample", "lower", "missing"]);
    expect(rows[0].rank).toBe(1);
  });
  it("converts stable class ranks to league-specific pick labels", () => {
    expect(prospectPick(13, 12)).toBe("2.01");
    expect(prospectPick(13, 10)).toBe("2.03");
  });
  it("updates matching records while preserving other classes", () => {
    const previous = { ...player, draftYear: 2026 };
    expect(mergeProspects([previous, player], [{ ...player, overall: 95 }])).toEqual([previous, { ...player, overall: 95 }]);
  });
  it("persists imports transactionally and keeps existing classes", async () => {
    const db = await createTestDb();
    await saveCollegeProspects([player], db);
    await saveCollegeProspects([{ ...player, overall: 95 }, { ...player, draftYear: 2026 }], db);
    expect(await getCollegeProspects(db)).toEqual([{ ...player, overall: 95 }, { ...player, draftYear: 2026 }]);
  });
});
