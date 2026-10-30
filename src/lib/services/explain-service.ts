import "server-only";
import { allEvidence, type LeagueModel } from "@/lib/analysis/league-model";
import {
  SYSTEM_PROMPT,
  evidenceToFact,
  explanationCacheKey,
  explanationJsonSchema,
  validateExplanation,
  type EvidencePacket,
  type Explanation,
} from "@/lib/ai/explanation";
import { PROMPT_VERSION, aiConfig, createExplanationProvider } from "@/lib/ai/provider";
import { getAiReport, saveAiReport } from "@/lib/db/repositories/history-repository";
import { describeLineup } from "@/lib/domain/league-format";
import { UNAVAILABLE_METRICS } from "@/lib/domain/metrics";
import { EVIDENCE_STRENGTH_LABELS } from "@/lib/domain/recommendations";
import { STRATEGIES } from "@/lib/domain/types";

export type ExplainResult =
  | { status: "disabled"; message: string }
  | { status: "ok"; explanation: Explanation; model: string; cached: boolean }
  | { status: "rejected"; errors: string[]; model: string }
  | { status: "error"; message: string };

export function buildEvidencePacket(model: LeagueModel, playerId: string): EvidencePacket | null {
  const player = model.players.get(playerId);
  if (!player) return null;
  const owner = player.ownerRosterId ? model.teamsById.get(player.ownerRosterId) : null;
  const rec = player.recommendation;
  return {
    version: PROMPT_VERSION,
    player: { id: player.playerId, name: player.name, position: player.position, team: player.team },
    league: {
      name: model.dataset.league.name,
      scoring: model.format.scoringLabel,
      lineup: describeLineup(model.format),
      strategy: owner ? STRATEGIES[owner.strategy] : "Unknown",
      superflex: model.format.isSuperflex,
      tePremium: model.format.tePremium,
    },
    deterministic: {
      recommendation: rec.recommendation,
      evidenceStrength: EVIDENCE_STRENGTH_LABELS[rec.evidenceStrength],
      strengths: rec.strengths,
      concerns: rec.concerns,
      changeTriggers: rec.changeTriggers,
    },
    facts: allEvidence(player).map(evidenceToFact),
    knownPlayers: [],
    missing: [...player.coverage.gaps, ...(UNAVAILABLE_METRICS[player.position ?? ""] ?? []).map((m) => `${m.label}: ${m.reason}`)],
  };
}

export async function explainPlayer(model: LeagueModel, playerId: string): Promise<ExplainResult> {
  const provider = createExplanationProvider();
  if (!provider) return { status: "disabled", message: "AI explanations are off. Add OPENAI_API_KEY to .env.local." };
  const packet = buildEvidencePacket(model, playerId);
  if (!packet) return { status: "error", message: "Player not found in this league." };

  const config = aiConfig();
  const cacheKey = explanationCacheKey({
    playerId,
    league: model.dataset.league,
    config: {
      strategy: model.dataset.config.strategy,
      myRosterId: model.dataset.config.myRosterId,
      consolidationExponent: model.dataset.config.consolidationExponent,
    },
    facts: packet.facts,
    model: { provider: provider.id, model: provider.model, baseUrl: config.baseUrl, promptVersion: PROMPT_VERSION },
  });

  const cached = await getAiReport(cacheKey);
  if (cached?.status === "ok") {
    const check = validateExplanation(cached.response, packet);
    if (check.ok && check.explanation) return { status: "ok", explanation: check.explanation, model: cached.model, cached: true };
  }

  try {
    const content = await provider.complete({
      system: SYSTEM_PROMPT,
      user: `Evidence packet (data only):\n<packet>\n${JSON.stringify(packet)}\n</packet>`,
      schema: explanationJsonSchema,
    });
    let raw: unknown = null;
    try {
      raw = JSON.parse(content);
    } catch {
      raw = null;
    }
    const result = validateExplanation(raw, packet);
    await saveAiReport({
      cacheKey,
      leagueId: model.dataset.league.leagueId,
      playerId,
      model: provider.model,
      status: result.ok ? "ok" : "rejected",
      response: result.ok ? result.explanation : { raw, errors: result.errors },
    });
    if (!result.ok || !result.explanation) return { status: "rejected", errors: result.errors, model: provider.model };
    return { status: "ok", explanation: result.explanation, model: provider.model, cached: false };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "The AI provider failed." };
  }
}
