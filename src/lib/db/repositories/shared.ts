import { getDb, type Database } from "../client";

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export function nowIso() {
  return new Date().toISOString();
}

/** Repositories accept an optional database so tests can pass an in-memory instance. */
export async function resolveDb(db?: Database) {
  return db ?? getDb();
}
