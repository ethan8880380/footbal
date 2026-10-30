import type { LeagueModel } from "@/lib/analysis/league-model";
import { valuePick } from "@/lib/domain/picks";
import { assetName, type TradeEvaluation } from "@/lib/domain/trade/evaluate";
import type { Strategy } from "@/lib/domain/types";
import { parseAssetKey, playerKey } from "@/lib/domain/valuation";
import type { TradeProposal } from "@/lib/domain/trade/types";

export function tradeLabHref(leagueId: string, proposal: TradeProposal) {
  const query = new URLSearchParams({ a: proposal.sideA.rosterId, b: proposal.sideB.rosterId, ga: proposal.sideA.gives.join(","), gb: proposal.sideB.gives.join(",") });
  return `/leagues/${leagueId}/trade-lab?${query}`;
}

export interface CatalogAsset {
  key: string;
  rosterId: string;
  kind: "player" | "pick";
  label: string;
  position: string | null;
  detail: string;
  value: number | null;
}

export interface CatalogTeam {
  rosterId: string;
  name: string;
  strategy: Strategy;
  strategySource: string;
}

export function tradeCatalog(model: LeagueModel) {
  const assets: CatalogAsset[] = [];
  for (const team of model.teams) {
    for (const id of team.roster.players) {
      const player = model.players.get(id);
      assets.push({
        key: playerKey(id),
        rosterId: team.rosterId,
        kind: "player",
        label: player?.name ?? `Unknown player ${id}`,
        position: player?.position ?? null,
        detail: [player?.team ?? "FA", player?.age != null ? player.age.toFixed(1) : null, player?.rosterSlot === "taxi" ? "taxi" : player?.rosterSlot === "reserve" ? "IR" : null]
          .filter(Boolean)
          .join(" · "),
        value: player?.market?.value ?? null,
      });
    }
    for (const pick of team.picks) {
      assets.push({
        key: pick.key,
        rosterId: team.rosterId,
        kind: "pick",
        label: assetName(pick.key, model.tradeContext),
        position: "PICK",
        detail: pick.slot !== null ? `Slot ${pick.round}.${String(pick.slot).padStart(2, "0")}` : "Slot unknown",
        value: model.dataset.market ? valuePick(pick, model.dataset.market).value : null,
      });
    }
  }
  const teams: CatalogTeam[] = model.teams.map((t) => ({ rosterId: t.rosterId, name: t.name, strategy: t.strategy, strategySource: t.strategySource }));
  return { teams, assets, myRosterId: model.myTeam?.rosterId ?? null };
}

/** Names for every asset and player an evaluation references, so the client can render it without lookups. */
export function evaluationNames(evaluation: TradeEvaluation, model: LeagueModel) {
  const names: Record<string, string> = {};
  const add = (key: string) => {
    names[key] = assetName(key, model.tradeContext);
  };
  for (const side of evaluation.sides ?? []) {
    side.gives.assets.forEach((a) => add(a.assetKey));
    side.receives.assets.forEach((a) => add(a.assetKey));
    for (const id of [...(side.lineup?.entering ?? []), ...(side.lineup?.leaving ?? []), ...side.capacity.cutCandidates]) {
      names[id] = model.players.get(id)?.name ?? id;
    }
    for (const a of side.lineup?.after.assignments ?? []) if (a.playerId) names[a.playerId] = model.players.get(a.playerId)?.name ?? a.playerId;
  }
  return names;
}

export function assetPosition(key: string, model: LeagueModel) {
  const parsed = parseAssetKey(key);
  return parsed?.kind === "player" ? model.players.get(parsed.playerId)?.position ?? null : "PICK";
}
