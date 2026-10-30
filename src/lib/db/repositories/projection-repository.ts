import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../client";
import { playerProjections } from "../schema";
import type { PropLine } from "@/lib/domain/player-props";
import { chunk, nowIso, resolveDb } from "./shared";

export type ProjectionSource = "sleeper" | "sportsgameodds";

export interface ProjectionRow {
  playerId: string;
  stats: Record<string, number> | null;
  lines: PropLine[] | null;
}

export interface WeekProjections {
  sleeper: Map<string, Record<string, number>>;
  props: Map<string, PropLine[]>;
  retrievedAt: { sleeper: string | null; props: string | null };
}

export async function replaceProjections(source: ProjectionSource, season: number, week: number, rows: ProjectionRow[], database?: Database) {
  const db = await resolveDb(database);
  const retrievedAt = nowIso();
  const where = and(eq(playerProjections.source, source), eq(playerProjections.season, season), eq(playerProjections.week, week));
  await db.transaction(async (tx) => {
    await tx.delete(playerProjections).where(where);
    for (const batch of chunk(rows, 400)) {
      await tx.insert(playerProjections).values(batch.map((r) => ({ ...r, source, season, week, retrievedAt }))).onConflictDoNothing();
    }
  });
}

export async function getWeekProjections(season: number, week: number, playerIds: string[], database?: Database): Promise<WeekProjections> {
  const db = await resolveDb(database);
  const result: WeekProjections = { sleeper: new Map(), props: new Map(), retrievedAt: { sleeper: null, props: null } };
  for (const batch of chunk([...new Set(playerIds)], 500)) {
    const rows = await db
      .select()
      .from(playerProjections)
      .where(and(eq(playerProjections.season, season), eq(playerProjections.week, week), inArray(playerProjections.playerId, batch)));
    for (const row of rows) {
      if (row.source === "sleeper" && row.stats) {
        result.sleeper.set(row.playerId, row.stats);
        result.retrievedAt.sleeper = row.retrievedAt;
      } else if (row.source === "sportsgameodds" && row.lines?.length) {
        result.props.set(row.playerId, row.lines);
        result.retrievedAt.props = row.retrievedAt;
      }
    }
  }
  return result;
}
