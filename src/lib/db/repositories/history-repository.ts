import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../client";
import { aiReports, savedTrades, snapshots, syncRuns } from "../schema";
import { nowIso, resolveDb } from "./shared";

export type SyncStatus = "running" | "success" | "partial" | "error" | "unavailable";

export interface SyncRun {
  scope: string;
  key: string;
  status: SyncStatus;
  message: string | null;
  dataCutoff: string | null;
  rowCount: number | null;
  sourceUrl: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export async function recordSyncRun(run: Omit<SyncRun, "finishedAt"> & { finishedAt?: string | null }, database?: Database) {
  const db = await resolveDb(database);
  const row = { ...run, finishedAt: run.finishedAt ?? (run.status === "running" ? null : nowIso()) };
  await db.insert(syncRuns).values(row).onConflictDoUpdate({ target: [syncRuns.scope, syncRuns.key], set: row });
}

export async function getSyncRun(scope: string, key: string, database?: Database): Promise<SyncRun | null> {
  const db = await resolveDb(database);
  const [row] = await db.select().from(syncRuns).where(and(eq(syncRuns.scope, scope), eq(syncRuns.key, key)));
  return (row as SyncRun | undefined) ?? null;
}

export async function listSyncRuns(database?: Database): Promise<SyncRun[]> {
  const db = await resolveDb(database);
  return (await db.select().from(syncRuns)) as SyncRun[];
}

export async function saveSnapshot(leagueId: string, rosterId: string | null, data: unknown, database?: Database) {
  const db = await resolveDb(database);
  await db.insert(snapshots).values({ leagueId, rosterId, data, createdAt: nowIso() });
}

export async function getRecentSnapshots(leagueId: string, limit = 2, database?: Database) {
  const db = await resolveDb(database);
  return db.select().from(snapshots).where(eq(snapshots.leagueId, leagueId)).orderBy(desc(snapshots.createdAt), desc(snapshots.id)).limit(limit);
}

export interface SavedTradeInput {
  leagueId: string;
  name: string;
  sideARosterId: string;
  sideBRosterId: string;
  sideA: string[];
  sideB: string[];
  summary: string;
  evaluation: unknown;
}

export async function saveTrade(trade: SavedTradeInput, database?: Database) {
  const db = await resolveDb(database);
  await db.insert(savedTrades).values({ ...trade, createdAt: nowIso() });
}

export async function listSavedTrades(leagueId: string, database?: Database) {
  const db = await resolveDb(database);
  return db.select().from(savedTrades).where(eq(savedTrades.leagueId, leagueId)).orderBy(desc(savedTrades.createdAt));
}

export async function deleteSavedTrade(id: number, database?: Database) {
  const db = await resolveDb(database);
  await db.delete(savedTrades).where(eq(savedTrades.id, id));
}

export async function getAiReport(cacheKey: string, database?: Database): Promise<typeof aiReports.$inferSelect | null> {
  const db = await resolveDb(database);
  const [row] = await db.select().from(aiReports).where(eq(aiReports.cacheKey, cacheKey));
  return row ?? null;
}

export async function saveAiReport(row: { cacheKey: string; leagueId: string; playerId: string; model: string; status: string; response: unknown }, database?: Database) {
  const db = await resolveDb(database);
  const value = { ...row, createdAt: nowIso() };
  await db.insert(aiReports).values(value).onConflictDoUpdate({ target: aiReports.cacheKey, set: value });
}
