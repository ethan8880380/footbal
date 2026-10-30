import { parseAssetKey } from "../valuation";
import { assetName, type TradeEvaluation } from "./evaluate";
import type { TradeContext, TradeProposal } from "./types";

/** Plain-language offer text built only from validated assets, written to the receiving manager. */
export function offerSummary(proposal: TradeProposal, evaluation: TradeEvaluation, ctx: TradeContext) {
  const teamA = ctx.teams.get(proposal.sideA.rosterId)?.name ?? "Team A";
  const teamB = ctx.teams.get(proposal.sideB.rosterId)?.name ?? "Team B";
  const list = (keys: string[]) => keys.map((key) => assetName(key, ctx)).join(", ");
  const lines = [`${teamA} sends: ${list(proposal.sideA.gives)}`, `${teamB} sends: ${list(proposal.sideB.gives)}`];

  const theirs = evaluation.sides?.[1];
  if (theirs) {
    const incoming = new Set(proposal.sideA.gives.map(parseAssetKey).flatMap((a) => (a?.kind === "player" ? [a.playerId] : [])));
    const newStarters = (theirs.lineup?.entering ?? []).filter((id) => incoming.has(id));
    if (newStarters.length) lines.push(`For you: ${list(newStarters.map((id) => `player:${id}`))} would step into your starting lineup.`);
    if (theirs.timeline.fit === "good") lines.push(theirs.timeline.note);
  }
  return lines.join("\n");
}
