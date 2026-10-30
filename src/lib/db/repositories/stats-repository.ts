import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../client";
import { prospectCombine, prospectDraft, scheduleGames, snapWeeks, statWeeks, teamGameTotals } from "../schema";
import type { CombineRecord, DraftProspectRecord, ScheduleGame, SnapWeekRecord, StatWeekRecord, TeamGameTotals } from "@/lib/domain/types";
import { chunk, resolveDb } from "./shared";

type StatRow = typeof statWeeks.$inferInsert;
type SnapRow = typeof snapWeeks.$inferInsert;

export async function replaceSeasonStats(season: number, rows: StatRow[], snaps: SnapRow[], totals: TeamGameTotals[], database?: Database) {
  const db = await resolveDb(database);
  await db.transaction(async (tx) => {
    await tx.delete(statWeeks).where(eq(statWeeks.season, season));
    for (const batch of chunk(rows, 400)) await tx.insert(statWeeks).values(batch);
    await tx.delete(snapWeeks).where(eq(snapWeeks.season, season));
    for (const batch of chunk(snaps, 400)) await tx.insert(snapWeeks).values(batch).onConflictDoNothing();
    await tx.delete(teamGameTotals).where(eq(teamGameTotals.season, season));
    for (const batch of chunk(totals, 400)) await tx.insert(teamGameTotals).values(batch).onConflictDoNothing();
  });
}

export async function replaceSchedule(seasons: number[], games: ScheduleGame[], database?: Database) {
  const db = await resolveDb(database);
  await db.transaction(async (tx) => {
    await tx.delete(scheduleGames).where(inArray(scheduleGames.season, seasons));
    for (const batch of chunk(games, 400)) await tx.insert(scheduleGames).values(batch);
  });
}

export async function getSeasonSchedule(season: number, database?: Database): Promise<ScheduleGame[]> {
  const db = await resolveDb(database);
  return db.select().from(scheduleGames).where(eq(scheduleGames.season, season));
}

export async function replaceProspects(
  draft: (DraftProspectRecord & { gsisId: string | null; position: string | null })[],
  combine: (CombineRecord & { position: string | null; school: string | null })[],
  database?: Database,
) {
  const db = await resolveDb(database);
  await db.transaction(async (tx) => {
    await tx.delete(prospectDraft);
    for (const batch of chunk(draft, 400)) await tx.insert(prospectDraft).values(batch).onConflictDoNothing();
    await tx.delete(prospectCombine);
    for (const batch of chunk(combine, 400)) await tx.insert(prospectCombine).values(batch).onConflictDoNothing();
  });
}

export async function getSeasonData(season: number, gsisIds: string[], pfrIds: string[], database?: Database) {
  const db = await resolveDb(database);
  const statRows: StatWeekRecord[] = [];
  for (const batch of chunk(gsisIds, 500)) {
    const rows = await db.select().from(statWeeks).where(and(eq(statWeeks.season, season), inArray(statWeeks.gsisId, batch)));
    statRows.push(...rows.map((r) => ({ season: r.season, week: r.week, seasonType: r.seasonType, gsisId: r.gsisId, gameId: r.gameId, team: r.team, stats: r.stats })));
  }
  const snapRows: SnapWeekRecord[] = [];
  for (const batch of chunk(pfrIds, 500)) {
    const rows = await db.select().from(snapWeeks).where(and(eq(snapWeeks.season, season), inArray(snapWeeks.pfrId, batch)));
    snapRows.push(...rows);
  }
  const [totals, schedule] = await Promise.all([
    db.select().from(teamGameTotals).where(eq(teamGameTotals.season, season)),
    db.select().from(scheduleGames).where(eq(scheduleGames.season, season)),
  ]);
  return { statWeeks: statRows, snapWeeks: snapRows, teamTotals: totals, schedule };
}

export async function getProspects(pfrIds: string[], database?: Database) {
  const db = await resolveDb(database);
  const draft = new Map<string, DraftProspectRecord>();
  const combine = new Map<string, CombineRecord>();
  for (const batch of chunk(pfrIds, 500)) {
    const [draftRows, combineRows] = await Promise.all([
      db.select().from(prospectDraft).where(inArray(prospectDraft.pfrId, batch)),
      db.select().from(prospectCombine).where(inArray(prospectCombine.pfrId, batch)),
    ]);
    for (const row of draftRows) draft.set(row.pfrId, row);
    for (const row of combineRows) combine.set(row.pfrId, row);
  }
  return { draft, combine };
}
