"use server";

import { after } from "next/server";
import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { deleteLeague, getLeagueBundle } from "@/lib/db/repositories/league-repository";
import { saveMarketRun, saveObservations } from "@/lib/db/repositories/market-repository";
import { deleteSavedTrade, saveTrade } from "@/lib/db/repositories/history-repository";
import { setAppState, setAssetFlag, updateLeagueConfig } from "@/lib/db/repositories/settings-repository";
import { evaluateTrade } from "@/lib/domain/trade/evaluate";
import { offerSummary } from "@/lib/domain/trade/summary";
import { STRATEGIES, type Strategy } from "@/lib/domain/types";
import { parseMetricCsv, parseValueCsv } from "@/lib/providers/csv-import";
import { DEMO_LEAGUE_ID } from "@/lib/demo/demo-dataset";
import { explainPlayer, type ExplainResult } from "@/lib/services/explain-service";
import { getLeagueModel } from "@/lib/services/league-service";
import { refreshLeague } from "@/lib/services/sync-service";
import { evaluationNames } from "@/lib/view/trade-view";
import { advisorRequestSchema, type AdvisorResult } from "@/lib/ai/advisor";
import { adviseLeague } from "@/lib/services/advisor-service";

const leagueIdSchema = z.string().regex(/^(\d+|demo)$/);
const strategySchema = z.enum(Object.keys(STRATEGIES) as [Strategy, ...Strategy[]]);

export interface ActionState {
  ok: boolean;
  message: string;
}

export async function adviseLeagueAction(leagueId: string, input: unknown): Promise<AdvisorResult> {
  const empty = (message: string): AdvisorResult => ({ cards: [], source: "rules", cached: false, message });
  const parsed = advisorRequestSchema.safeParse(input);
  if (!leagueIdSchema.safeParse(leagueId).success || !parsed.success) return empty("Choose a valid league and request.");
  try {
    const model = await getLeagueModel(leagueId);
    if (!model?.myTeam) return empty("Select your team first.");
    if (parsed.data.mode === "counter" && ![parsed.data.proposal?.sideA.rosterId, parsed.data.proposal?.sideB.rosterId].includes(model.myTeam.rosterId)) return empty("Choose your team on one side to suggest a counteroffer.");
    return await adviseLeague(model, parsed.data);
  } catch {
    return empty("Could not load league advice. Try again after syncing.");
  }
}

export async function connectLeagueAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ leagueId: leagueIdSchema, rosterId: z.string().min(1), userId: z.string().min(1), username: z.string().min(1) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Choose a league and a team." };
  const { leagueId, rosterId, userId, username } = parsed.data;

  const result = await refreshLeague(leagueId, { connectedUserId: userId });
  const league = result.steps.find((s) => s.scope === "league");
  if (league?.status === "error") return { ok: false, message: `Sleeper import failed: ${league.message}` };

  await updateLeagueConfig(leagueId, { myRosterId: rosterId });
  await setAppState("lastUsername", username);
  await setAppState("lastLeagueId", leagueId);
  if (result.historyJob) after(result.historyJob);
  redirect(`/leagues/${leagueId}`);
}

export async function refreshLeagueAction(leagueId: string, force: boolean): Promise<ActionState> {
  if (!leagueIdSchema.safeParse(leagueId).success || leagueId === DEMO_LEAGUE_ID) return { ok: false, message: "Demo data does not sync." };
  const result = await refreshLeague(leagueId, { force });
  if (result.historyJob) after(result.historyJob);
  refresh();
  const failed = result.steps.filter((s) => s.status === "error");
  return failed.length
    ? { ok: false, message: `Synced with ${failed.length} source error${failed.length > 1 ? "s" : ""}: ${failed.map((f) => f.scope).join(", ")}.` }
    : { ok: true, message: "League synced." };
}

export async function removeLeagueAction(leagueId: string) {
  if (!leagueIdSchema.safeParse(leagueId).success || leagueId === DEMO_LEAGUE_ID) return;
  await deleteLeague(leagueId);
  redirect("/");
}

export async function setMyRosterAction(leagueId: string, rosterId: string) {
  const bundle = leagueId === DEMO_LEAGUE_ID ? null : await getLeagueBundle(leagueId);
  if (leagueId !== DEMO_LEAGUE_ID && !bundle?.rosters.some((r) => r.rosterId === rosterId)) return;
  await updateLeagueConfig(leagueId, { myRosterId: rosterId });
  refresh();
}

export async function setStrategyAction(leagueId: string, strategy: string) {
  const parsed = strategySchema.safeParse(strategy);
  if (!parsed.success) return;
  await updateLeagueConfig(leagueId, { strategy: parsed.data });
  refresh();
}

export async function setAssetFlagAction(leagueId: string, assetKey: string, flag: "protected" | "available" | null) {
  await setAssetFlag(leagueId, assetKey, flag);
  refresh();
}

const settingsSchema = z.object({
  strategy: strategySchema,
  targetPositions: z.array(z.string()),
  maxPicks: z.coerce.number().int().min(0).max(3),
  allowFirsts: z.boolean(),
  consolidationExponent: z.coerce.number().min(1).max(2),
  draftOrderRules: z.string().max(2000),
  confirmedPickSeasons: z.array(z.string().regex(/^\d{4}$/)),
  manualDraftSlots: z.record(z.string(), z.number().int().min(1).max(32)),
  opponentStrategies: z.record(z.string(), strategySchema),
  marketProvider: z.enum(["statsguy", "csv"]),
});

export async function saveSettingsAction(leagueId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const slots: Record<string, number> = {};
  const opponents: Record<string, Strategy> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("slot:") && String(value).trim()) slots[key.slice(5)] = Number(value);
    if (key.startsWith("opponent:") && value !== "estimate") opponents[key.slice(9)] = value as Strategy;
  }
  const parsed = settingsSchema.safeParse({
    strategy: formData.get("strategy"),
    targetPositions: formData.getAll("targetPositions").map(String),
    maxPicks: formData.get("maxPicks"),
    allowFirsts: formData.get("allowFirsts") === "on",
    consolidationExponent: formData.get("consolidationExponent"),
    draftOrderRules: String(formData.get("draftOrderRules") ?? ""),
    confirmedPickSeasons: formData.getAll("confirmedPickSeasons").map(String),
    manualDraftSlots: slots,
    opponentStrategies: opponents,
    marketProvider: formData.get("marketProvider") ?? "statsguy",
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const { maxPicks, allowFirsts, draftOrderRules, ...rest } = parsed.data;
  await updateLeagueConfig(leagueId, { ...rest, pickBudget: { maxPicks, allowFirsts }, draftOrderRules: draftOrderRules.trim() || null });
  refresh();
  return { ok: true, message: "Settings saved." };
}

const proposalSchema = z.object({
  sideA: z.object({ rosterId: z.string(), gives: z.array(z.string()).max(12) }),
  sideB: z.object({ rosterId: z.string(), gives: z.array(z.string()).max(12) }),
});

export async function evaluateTradeAction(leagueId: string, proposal: unknown) {
  const parsed = proposalSchema.safeParse(proposal);
  if (!parsed.success) return null;
  const model = await getLeagueModel(leagueId);
  if (!model) return null;
  const evaluation = evaluateTrade(parsed.data, model.tradeContext);
  return {
    evaluation,
    names: evaluationNames(evaluation, model),
    summary: evaluation.isValid ? offerSummary(parsed.data, evaluation, model.tradeContext) : null,
  };
}

export async function saveTradeAction(leagueId: string, name: string, proposal: unknown): Promise<ActionState> {
  const parsed = proposalSchema.safeParse(proposal);
  if (!parsed.success) return { ok: false, message: "Invalid trade." };
  const model = await getLeagueModel(leagueId);
  if (!model) return { ok: false, message: "League not found." };
  const evaluation = evaluateTrade(parsed.data, model.tradeContext);
  if (!evaluation.isValid) return { ok: false, message: evaluation.issues.map((i) => i.message).join(" ") };
  await saveTrade({
    leagueId,
    name: name.trim() || "Untitled trade",
    sideARosterId: parsed.data.sideA.rosterId,
    sideBRosterId: parsed.data.sideB.rosterId,
    sideA: parsed.data.sideA.gives,
    sideB: parsed.data.sideB.gives,
    summary: offerSummary(parsed.data, evaluation, model.tradeContext),
    evaluation,
  });
  revalidatePath(`/leagues/${leagueId}/trade-lab`);
  refresh();
  return { ok: true, message: "Trade saved." };
}

export async function deleteSavedTradeAction(leagueId: string, id: number) {
  await deleteSavedTrade(id);
  refresh();
}

export async function importCsvAction(leagueId: string, kind: "values" | "metrics", _: ActionState, formData: FormData): Promise<ActionState> {
  const file = formData.get("file");
  const text = file instanceof File && file.size > 0 ? await file.text() : String(formData.get("text") ?? "");
  if (!text.trim()) return { ok: false, message: "Choose a CSV file or paste CSV text." };
  if (text.length > 5_000_000) return { ok: false, message: "CSV is larger than 5 MB." };

  if (kind === "values") {
    const { values, picks, valuedAt, errors } = parseValueCsv(text);
    if (errors.length) return { ok: false, message: errors.slice(0, 5).join(" ") };
    await saveMarketRun({ provider: "csv", variantKey: "csv", sourceUrl: "csv-import", valuedAt, values: values.map((v) => ({ ...v, metadataUpdatedAt: null })), picks });
    await updateLeagueConfig(leagueId, { marketProvider: "csv" });
    refresh();
    return { ok: true, message: `Imported ${values.length} player and ${picks.length} pick values. This league now uses CSV values.` };
  }
  const batch = new Date().toISOString();
  const { evidence, errors } = parseMetricCsv(text, batch);
  if (errors.length) return { ok: false, message: errors.slice(0, 5).join(" ") };
  await saveObservations(evidence.map((e) => ({ ...e, importBatch: batch })));
  refresh();
  return { ok: true, message: `Imported ${evidence.length} observations.` };
}

export async function explainPlayerAction(leagueId: string, playerId: string): Promise<ExplainResult> {
  const model = await getLeagueModel(leagueId);
  if (!model) return { status: "error", message: "League not found." };
  return explainPlayer(model, playerId);
}
