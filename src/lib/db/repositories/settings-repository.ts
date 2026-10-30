import { and, eq } from "drizzle-orm";
import type { Database } from "../client";
import { appState, assetFlags, leagueConfig } from "../schema";
import { DEFAULT_CONSOLIDATION_EXPONENT } from "@/lib/domain/valuation";
import { STRATEGIES, type AssetFlag, type LeagueConfig, type Strategy } from "@/lib/domain/types";
import { nowIso, resolveDb } from "./shared";

export type MarketProviderId = "statsguy" | "csv";

export interface StoredLeagueConfig extends LeagueConfig {
  marketProvider: MarketProviderId;
}

export function defaultConfig(leagueId: string): StoredLeagueConfig {
  return {
    leagueId,
    myRosterId: null,
    strategy: "balanced",
    targetPositions: [],
    pickBudget: { maxPicks: 1, allowFirsts: false },
    consolidationExponent: DEFAULT_CONSOLIDATION_EXPONENT,
    draftOrderRules: null,
    manualDraftSlots: {},
    confirmedPickSeasons: [],
    opponentStrategies: {},
    flags: new Map(),
    marketProvider: "statsguy",
  };
}

function asStrategy(value: string): Strategy {
  return value in STRATEGIES ? (value as Strategy) : "balanced";
}

export async function getLeagueConfig(leagueId: string, database?: Database): Promise<StoredLeagueConfig> {
  const db = await resolveDb(database);
  const [row] = await db.select().from(leagueConfig).where(eq(leagueConfig.leagueId, leagueId));
  const flagRows = await db.select().from(assetFlags).where(eq(assetFlags.leagueId, leagueId));
  const flags = new Map(flagRows.map((f) => [f.assetKey, f.flag as AssetFlag]));
  if (!row) return { ...defaultConfig(leagueId), flags };
  return {
    leagueId,
    myRosterId: row.myRosterId,
    strategy: asStrategy(row.strategy),
    targetPositions: row.targetPositions,
    pickBudget: row.pickBudget,
    consolidationExponent: row.consolidationExponent,
    draftOrderRules: row.draftOrderRules,
    manualDraftSlots: row.manualDraftSlots,
    confirmedPickSeasons: row.confirmedPickSeasons,
    opponentStrategies: Object.fromEntries(Object.entries(row.opponentStrategies).map(([k, v]) => [k, asStrategy(v)])),
    flags,
    marketProvider: row.marketProvider === "csv" ? "csv" : "statsguy",
  };
}

export async function updateLeagueConfig(
  leagueId: string,
  patch: Partial<Omit<StoredLeagueConfig, "leagueId" | "flags">>,
  database?: Database,
) {
  const db = await resolveDb(database);
  const current = await getLeagueConfig(leagueId, db);
  const { flags: _, ...rest } = { ...current, ...patch };
  const row = { ...rest, leagueId, updatedAt: nowIso() };
  await db.insert(leagueConfig).values(row).onConflictDoUpdate({ target: leagueConfig.leagueId, set: row });
}

export async function setAssetFlag(leagueId: string, assetKey: string, flag: AssetFlag | null, database?: Database) {
  const db = await resolveDb(database);
  if (flag === null) {
    await db.delete(assetFlags).where(and(eq(assetFlags.leagueId, leagueId), eq(assetFlags.assetKey, assetKey)));
    return;
  }
  const row = { leagueId, assetKey, flag, updatedAt: nowIso() };
  await db.insert(assetFlags).values(row).onConflictDoUpdate({ target: [assetFlags.leagueId, assetFlags.assetKey], set: row });
}

export async function getAppState<T>(key: string, database?: Database): Promise<T | null> {
  const db = await resolveDb(database);
  const [row] = await db.select().from(appState).where(eq(appState.key, key));
  return (row?.value as T | undefined) ?? null;
}

export async function setAppState(key: string, value: unknown, database?: Database) {
  const db = await resolveDb(database);
  await db.insert(appState).values({ key, value }).onConflictDoUpdate({ target: appState.key, set: { value } });
}
