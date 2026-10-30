import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../client";
import { marketPicks, marketRuns, marketValueHistory, marketValues, metricObservations } from "../schema";
import type { Evidence, MarketPickRecord, MarketValueRecord, ValueHistoryPoint } from "@/lib/domain/types";
import { chunk, nowIso, resolveDb } from "./shared";

export interface MarketRunInput {
  provider: string;
  variantKey: string;
  sourceUrl: string;
  valuedAt: string | null;
  values: (MarketValueRecord & { metadataUpdatedAt: string | null })[];
  picks: MarketPickRecord[];
}

export async function saveMarketRun(run: MarketRunInput, database?: Database) {
  const db = await resolveDb(database);
  const retrievedAt = nowIso();
  const { provider, variantKey, valuedAt } = run;
  await db.transaction(async (tx) => {
    const runRow = { provider, variantKey, valuedAt, retrievedAt, total: run.values.length, sourceUrl: run.sourceUrl };
    await tx.insert(marketRuns).values(runRow).onConflictDoUpdate({ target: [marketRuns.provider, marketRuns.variantKey], set: runRow });

    await tx.delete(marketValues).where(and(eq(marketValues.provider, provider), eq(marketValues.variantKey, variantKey)));
    for (const batch of chunk(run.values, 400)) {
      await tx.insert(marketValues).values(batch.map((v) => ({ ...v, provider, variantKey, valuedAt, retrievedAt })));
    }
    await tx.delete(marketPicks).where(and(eq(marketPicks.provider, provider), eq(marketPicks.variantKey, variantKey)));
    for (const batch of chunk(run.picks, 400)) {
      await tx.insert(marketPicks).values(batch.map((p) => ({ ...p, provider, variantKey, valuedAt, retrievedAt })));
    }

    if (valuedAt) {
      const date = valuedAt.slice(0, 10);
      const history = run.values.filter((v) => v.value !== null);
      for (const batch of chunk(history, 400)) {
        await tx
          .insert(marketValueHistory)
          .values(batch.map((v) => ({ provider, variantKey, assetId: v.playerId, date, value: v.value, origin: "local", retrievedAt })))
          .onConflictDoNothing();
      }
    }
  });
}

export async function getMarketRun(provider: string, variantKey: string, database?: Database) {
  const db = await resolveDb(database);
  const [run] = await db.select().from(marketRuns).where(and(eq(marketRuns.provider, provider), eq(marketRuns.variantKey, variantKey)));
  if (!run) return null;
  const [values, picks] = await Promise.all([
    db.select().from(marketValues).where(and(eq(marketValues.provider, provider), eq(marketValues.variantKey, variantKey))),
    db.select().from(marketPicks).where(and(eq(marketPicks.provider, provider), eq(marketPicks.variantKey, variantKey))),
  ]);
  return {
    run,
    values: new Map<string, MarketValueRecord>(values.map((v) => [v.playerId, v])),
    picks: new Map<string, MarketPickRecord>(picks.map((p) => [p.pickId, p])),
  };
}

export async function listMarketRuns(database?: Database) {
  const db = await resolveDb(database);
  return db.select().from(marketRuns);
}

export async function saveProviderHistory(provider: string, variantKey: string, assetId: string, points: { date: string; value: number | null }[], database?: Database) {
  const db = await resolveDb(database);
  const retrievedAt = nowIso();
  if (!points.length) return;
  await db
    .insert(marketValueHistory)
    .values(points.map((p) => ({ provider, variantKey, assetId, date: p.date, value: p.value, origin: "provider", retrievedAt })))
    .onConflictDoUpdate({
      target: [marketValueHistory.provider, marketValueHistory.variantKey, marketValueHistory.assetId, marketValueHistory.date],
      set: { origin: "provider", retrievedAt },
    });
}

export async function getValueHistory(provider: string, variantKey: string, assetIds: string[], database?: Database) {
  const db = await resolveDb(database);
  const result = new Map<string, ValueHistoryPoint[]>();
  for (const batch of chunk(assetIds, 400)) {
    const rows = await db
      .select()
      .from(marketValueHistory)
      .where(and(eq(marketValueHistory.provider, provider), eq(marketValueHistory.variantKey, variantKey), inArray(marketValueHistory.assetId, batch)))
      .orderBy(marketValueHistory.date);
    for (const row of rows) {
      const list = result.get(row.assetId) ?? [];
      list.push({ date: row.date, value: row.value, origin: row.origin as ValueHistoryPoint["origin"] });
      result.set(row.assetId, list);
    }
  }
  return result;
}

export async function latestProviderHistoryFetch(provider: string, variantKey: string, assetId: string, database?: Database) {
  const db = await resolveDb(database);
  const [row] = await db
    .select({ retrievedAt: marketValueHistory.retrievedAt })
    .from(marketValueHistory)
    .where(and(eq(marketValueHistory.provider, provider), eq(marketValueHistory.variantKey, variantKey), eq(marketValueHistory.assetId, assetId), eq(marketValueHistory.origin, "provider")))
    .orderBy(desc(marketValueHistory.retrievedAt))
    .limit(1);
  return row?.retrievedAt ?? null;
}

export async function saveObservations(rows: (Evidence & { importBatch: string })[], database?: Database) {
  const db = await resolveDb(database);
  await db.transaction(async (tx) => {
    for (const batch of chunk(rows, 200)) {
      await tx
        .insert(metricObservations)
        .values(
          batch.map((e) => ({
            id: e.id,
            playerId: e.playerId ?? "",
            metricKey: e.metricKey,
            label: e.label,
            value: typeof e.value === "number" ? e.value : null,
            units: e.units,
            provider: e.provider,
            sourceUrl: e.sourceUrl,
            season: e.season,
            weekStart: e.weekStart,
            weekEnd: e.weekEnd,
            dateStart: e.dateRange,
            dateEnd: null,
            sampleSize: e.sampleSize,
            definition: e.definition,
            denominator: e.denominator,
            dataCutoff: e.dataCutoff,
            retrievedAt: e.retrievedAt ?? nowIso(),
            kind: e.kind,
            importBatch: e.importBatch,
          })),
        )
        .onConflictDoUpdate({
          target: metricObservations.id,
          set: { value: sql.raw("excluded.value"), retrievedAt: sql.raw("excluded.retrieved_at"), importBatch: sql.raw("excluded.import_batch") },
        });
    }
  });
}

export async function getObservations(playerIdsList: string[], database?: Database): Promise<Evidence[]> {
  const db = await resolveDb(database);
  const result: Evidence[] = [];
  for (const batch of chunk(playerIdsList, 500)) {
    const rows = await db.select().from(metricObservations).where(inArray(metricObservations.playerId, batch));
    result.push(
      ...rows.map((r) => ({
        id: r.id,
        playerId: r.playerId,
        metricKey: r.metricKey,
        label: r.label,
        value: r.value,
        units: r.units,
        provider: r.provider,
        sourceUrl: r.sourceUrl,
        season: r.season,
        weekStart: r.weekStart,
        weekEnd: r.weekEnd,
        dateRange: r.dateStart,
        sampleSize: r.sampleSize,
        sampleUnit: null,
        definition: r.definition,
        denominator: r.denominator,
        dataCutoff: r.dataCutoff,
        retrievedAt: r.retrievedAt,
        kind: r.kind as Evidence["kind"],
      })),
    );
  }
  return result;
}
