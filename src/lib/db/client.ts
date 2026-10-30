import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";

export type Database = LibSQLDatabase<typeof schema>;

interface DbHandle {
  client: Client;
  db: Database;
  ready: Promise<void>;
}

const globalForDb = globalThis as unknown as { dynastyDeskDb?: DbHandle };

function resolveUrl() {
  const url = process.env.DATABASE_URL ?? "file:./data/dynasty-desk.db";
  if (url.startsWith("file:")) {
    const filePath = url.slice("file:".length);
    if (filePath !== ":memory:") mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  }
  return url;
}

function createHandle(url: string): DbHandle {
  const client = createClient({ url });
  const db = drizzle(client, { schema });
  const ready = (async () => {
    await client.execute("PRAGMA journal_mode = WAL");
    await client.execute("PRAGMA busy_timeout = 5000");
    await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  })();
  return { client, db, ready };
}

export async function getDb(): Promise<Database> {
  globalForDb.dynastyDeskDb ??= createHandle(resolveUrl());
  await globalForDb.dynastyDeskDb.ready;
  return globalForDb.dynastyDeskDb.db;
}

export async function createTestDb(): Promise<Database> {
  const handle = createHandle(":memory:");
  await handle.ready;
  return handle.db;
}
