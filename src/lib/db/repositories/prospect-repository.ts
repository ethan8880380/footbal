import { eq } from "drizzle-orm";
import { appState } from "../schema";
import { resolveDb } from "./shared";
import type { Database } from "../client";
import { mergeProspects, prospectSchema, type Prospect } from "@/lib/domain/prospects";

// College scouting data is shared across leagues, independently of roster ownership.
const KEY = "college-prospects:v1";
export async function getCollegeProspects(database?: Database): Promise<Prospect[]> {
  const db = await resolveDb(database);
  const [stored] = await db.select().from(appState).where(eq(appState.key, KEY));
  return stored ? prospectSchema.array().parse(stored.value) : [];
}

export async function saveCollegeProspects(rows: Prospect[], database?: Database) {
  const validated = prospectSchema.array().parse(rows);
  const db = await resolveDb(database);
  await db.transaction(async tx => {
    const [stored] = await tx.select().from(appState).where(eq(appState.key, KEY));
    const value = mergeProspects(stored ? prospectSchema.array().parse(stored.value) : [], validated);
    await tx.insert(appState).values({ key: KEY, value }).onConflictDoUpdate({ target: appState.key, set: { value } });
  });
}
