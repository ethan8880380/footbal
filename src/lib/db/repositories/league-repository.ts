import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "../client";
import {
  aiReports,
  assetFlags,
  drafts,
  leagueConfig,
  leagueMembers,
  leagues,
  rosters,
  savedTrades,
  sleeperUsers,
  snapshots,
  tradedPicks,
} from "../schema";
import type { DraftRecord, LeagueRecord, MemberRecord, RosterRecord, TradedPickRecord } from "@/lib/domain/types";
import { nowIso, resolveDb } from "./shared";

export interface LeagueImport {
  league: Omit<LeagueRecord, "retrievedAt"> & { previousLeagueId: string | null; draftId: string | null; metadata: Record<string, unknown> | null };
  members: (MemberRecord & { isCommissioner: boolean })[];
  rosters: RosterRecord[];
  drafts: DraftRecord[];
  tradedPicks: TradedPickRecord[];
  connectedUserId: string | null;
}

export async function saveSleeperUser(user: { userId: string; username: string; displayName: string | null; avatar: string | null }, database?: Database) {
  const db = await resolveDb(database);
  const row = { ...user, retrievedAt: nowIso() };
  await db.insert(sleeperUsers).values(row).onConflictDoUpdate({ target: sleeperUsers.userId, set: row });
}

export async function saveLeagueImport(data: LeagueImport, database?: Database) {
  const db = await resolveDb(database);
  const retrievedAt = nowIso();
  const leagueId = data.league.leagueId;
  await db.transaction(async (tx) => {
    const leagueRow = { ...data.league, connectedUserId: data.connectedUserId, retrievedAt };
    await tx.insert(leagues).values(leagueRow).onConflictDoUpdate({ target: leagues.leagueId, set: leagueRow });

    await tx.delete(leagueMembers).where(eq(leagueMembers.leagueId, leagueId));
    if (data.members.length) await tx.insert(leagueMembers).values(data.members.map((m) => ({ ...m, leagueId })));

    await tx.delete(rosters).where(eq(rosters.leagueId, leagueId));
    if (data.rosters.length) await tx.insert(rosters).values(data.rosters.map((r) => ({ ...r, leagueId })));

    await tx.delete(drafts).where(eq(drafts.leagueId, leagueId));
    if (data.drafts.length) {
      await tx.insert(drafts).values(
        data.drafts.map((d) => ({ ...d, leagueId, type: null, startTime: null, draftOrder: null, retrievedAt })),
      );
    }

    await tx.delete(tradedPicks).where(eq(tradedPicks.leagueId, leagueId));
    if (data.tradedPicks.length) await tx.insert(tradedPicks).values(data.tradedPicks.map((p) => ({ ...p, leagueId, retrievedAt })));
  });
}

export async function listLeagues(database?: Database) {
  const db = await resolveDb(database);
  return db
    .select({ leagueId: leagues.leagueId, name: leagues.name, season: leagues.season, avatar: leagues.avatar, retrievedAt: leagues.retrievedAt })
    .from(leagues)
    .orderBy(desc(leagues.season), leagues.name);
}

export async function getLeagueBundle(leagueId: string, database?: Database) {
  const db = await resolveDb(database);
  const [league] = await db.select().from(leagues).where(eq(leagues.leagueId, leagueId));
  if (!league) return null;
  const [memberRows, rosterRows, draftRows, pickRows] = await Promise.all([
    db.select().from(leagueMembers).where(eq(leagueMembers.leagueId, leagueId)),
    db.select().from(rosters).where(eq(rosters.leagueId, leagueId)),
    db.select().from(drafts).where(eq(drafts.leagueId, leagueId)),
    db.select().from(tradedPicks).where(eq(tradedPicks.leagueId, leagueId)),
  ]);
  return {
    league: {
      leagueId: league.leagueId,
      name: league.name,
      season: league.season,
      status: league.status,
      totalRosters: league.totalRosters,
      settings: league.settings,
      scoringSettings: league.scoringSettings,
      rosterPositions: league.rosterPositions,
      avatar: league.avatar,
      retrievedAt: league.retrievedAt,
    } satisfies LeagueRecord,
    connectedUserId: league.connectedUserId,
    members: memberRows.map(({ leagueId: _, isCommissioner: __, ...m }) => m) satisfies MemberRecord[],
    rosters: rosterRows
      .map(({ leagueId: _, ...r }) => r)
      .sort((a, b) => Number(a.rosterId) - Number(b.rosterId)) satisfies RosterRecord[],
    drafts: draftRows.map((d) => ({ draftId: d.draftId, season: d.season, status: d.status, rounds: d.rounds, slotToRosterId: d.slotToRosterId })) satisfies DraftRecord[],
    tradedPicks: pickRows.map((p) => ({
      season: p.season,
      round: p.round,
      originalRosterId: p.originalRosterId,
      ownerRosterId: p.ownerRosterId,
      previousOwnerRosterId: p.previousOwnerRosterId,
    })) satisfies TradedPickRecord[],
  };
}

/** Removes a league and everything saved for it. Shared caches (players, stats, values) are kept. */
export async function deleteLeague(leagueId: string, database?: Database) {
  const db = await resolveDb(database);
  await db.transaction(async (tx) => {
    for (const table of [leagueMembers, rosters, drafts, tradedPicks, leagueConfig, assetFlags, snapshots, savedTrades, aiReports]) {
      await tx.delete(table).where(eq(table.leagueId, leagueId));
    }
    await tx.delete(leagues).where(eq(leagues.leagueId, leagueId));
  });
}

export async function getRosterOwnership(leagueId: string, rosterIds: string[], database?: Database) {
  const db = await resolveDb(database);
  return db.select().from(rosters).where(and(eq(rosters.leagueId, leagueId), inArray(rosters.rosterId, rosterIds)));
}
