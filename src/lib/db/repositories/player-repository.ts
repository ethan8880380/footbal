import { inArray, isNotNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import { mappingIssues, playerIds, players } from "../schema";
import type { IdentityRecord, MappingIssue, PlayerRecord } from "@/lib/domain/types";
import { chunk, nowIso, resolveDb } from "./shared";

export type PlayerRow = typeof players.$inferInsert;

export async function replacePlayers(rows: PlayerRow[], database?: Database) {
  const db = await resolveDb(database);
  await db.transaction(async (tx) => {
    for (const batch of chunk(rows, 300)) {
      await tx
        .insert(players)
        .values(batch)
        .onConflictDoUpdate({
          target: players.playerId,
          set: Object.fromEntries(
            Object.keys(batch[0]).filter((k) => k !== "playerId").map((k) => [k, sql.raw(`excluded.${toSnake(k)}`)]),
          ),
        });
    }
  });
}

function toSnake(key: string) {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export async function getPlayers(ids: string[], database?: Database): Promise<Map<string, PlayerRecord>> {
  const db = await resolveDb(database);
  const result = new Map<string, PlayerRecord>();
  for (const batch of chunk([...new Set(ids)], 500)) {
    const rows = await db.select().from(players).where(inArray(players.playerId, batch));
    for (const row of rows) result.set(row.playerId, row);
  }
  return result;
}

export async function listIdentitySources(database?: Database) {
  const db = await resolveDb(database);
  return db
    .select({ playerId: players.playerId, gsisId: players.gsisId, sportradarId: players.sportradarId, position: players.position })
    .from(players);
}

export async function listNflTeamPlayers(database?: Database) {
  const db = await resolveDb(database);
  return db.select({ playerId: players.playerId, fullName: players.fullName, team: players.team }).from(players).where(isNotNull(players.team));
}

export async function replaceIdentities(identities: IdentityRecord[], issues: MappingIssue[], database?: Database) {
  const db = await resolveDb(database);
  const retrievedAt = nowIso();
  await db.transaction(async (tx) => {
    await tx.delete(playerIds);
    for (const batch of chunk(identities, 500)) {
      await tx.insert(playerIds).values(batch.map((i) => ({ ...i, sportradarId: null, retrievedAt })));
    }
    await tx.delete(mappingIssues);
    for (const batch of chunk(issues, 500)) {
      await tx.insert(mappingIssues).values(batch.map((i) => ({ ...i, createdAt: retrievedAt }))).onConflictDoNothing();
    }
  });
}

export async function getIdentities(ids: string[], database?: Database) {
  const db = await resolveDb(database);
  const identities = new Map<string, IdentityRecord>();
  const issues: MappingIssue[] = [];
  for (const batch of chunk([...new Set(ids)], 500)) {
    const [idRows, issueRows] = await Promise.all([
      db.select().from(playerIds).where(inArray(playerIds.sleeperId, batch)),
      db.select().from(mappingIssues).where(inArray(mappingIssues.sleeperId, batch)),
    ]);
    for (const row of idRows) identities.set(row.sleeperId, { sleeperId: row.sleeperId, gsisId: row.gsisId, pfrId: row.pfrId, resolvedVia: row.resolvedVia });
    issues.push(...issueRows.map(({ createdAt: _, ...issue }) => issue));
  }
  return { identities, issues };
}
