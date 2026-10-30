import { getSyncRun, recordSyncRun, type SyncStatus } from "@/lib/db/repositories/history-repository";

export const REFRESH_INTERVALS = {
  sleeperPlayers: 24 * 60 * 60 * 1000,
  identity: 24 * 60 * 60 * 1000,
  stats: 12 * 60 * 60 * 1000,
  prospects: 7 * 24 * 60 * 60 * 1000,
  market: 12 * 60 * 60 * 1000,
  projections: 3 * 60 * 60 * 1000,
  /** SportsGameOdds' free tier allows 2,500 games a month; a refresh costs about one per game on the slate. */
  props: 2 * 60 * 60 * 1000,
  league: 0,
};

export async function isFresh(scope: string, key: string, maxAgeMs: number) {
  if (maxAgeMs <= 0) return false;
  const run = await getSyncRun(scope, key);
  if (!run || (run.status !== "success" && run.status !== "partial") || !run.finishedAt) return false;
  return Date.now() - new Date(run.finishedAt).getTime() < maxAgeMs;
}

export interface StepResult {
  scope: string;
  key: string;
  status: SyncStatus | "skipped";
  message: string | null;
}

/** Runs a sync step, recording its outcome. Errors are captured, never thrown. */
export async function runStep(
  scope: string,
  key: string,
  work: () => Promise<{ status?: SyncStatus; message?: string | null; rowCount?: number | null; dataCutoff?: string | null; sourceUrl?: string | null }>,
): Promise<StepResult> {
  const startedAt = new Date().toISOString();
  try {
    const result = await work();
    const status = result.status ?? "success";
    await recordSyncRun({
      scope,
      key,
      status,
      message: result.message ?? null,
      rowCount: result.rowCount ?? null,
      dataCutoff: result.dataCutoff ?? null,
      sourceUrl: result.sourceUrl ?? null,
      startedAt,
    });
    return { scope, key, status, message: result.message ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const previous = await getSyncRun(scope, key);
    await recordSyncRun({
      scope,
      key,
      status: "error",
      message,
      rowCount: previous?.rowCount ?? null,
      dataCutoff: previous?.dataCutoff ?? null,
      sourceUrl: previous?.sourceUrl ?? null,
      startedAt,
    });
    return { scope, key, status: "error", message };
  }
}
