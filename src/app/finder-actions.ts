"use server";

import { z } from "zod";
import { findAssetTrades, assetOwner } from "@/lib/domain/trade/finder";
import { getLeagueModel } from "@/lib/services/league-service";
import { assetName } from "@/lib/domain/trade/evaluate";
import { evaluationNames, tradeLabHref } from "@/lib/view/trade-view";

const schema = z.object({
  leagueId: z.string().regex(/^(\d+|demo)$/), assetKey: z.string().min(1).max(150),
  goal: z.enum(["fit", "lineup", "value"]), returns: z.enum(["any", "players", "picks"]), keepFirsts: z.boolean(),
});

export async function findTradesAction(input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { trades: [], message: "Choose an asset and search options." };
  try {
    const { leagueId, keepFirsts, ...request } = parsed.data;
    const model = await getLeagueModel(leagueId);
    if (!model?.myTeam) return { trades: [], message: "Choose your team first." };
    if (!model.dataset.market) return { trades: [], message: "Sync market values or import values in Settings." };
    if (model.dataset.config.flags.get(request.assetKey) === "protected") return { trades: [], message: "This asset is protected. Change its protection in the roster before shopping it." };
    if (!assetOwner(request.assetKey, model.tradeContext)) return { trades: [], message: "This asset is no longer owned in this league. Refresh and choose another." };
    const options = findAssetTrades(request, model.tradeContext, {
      rosterId: model.myTeam.rosterId, flags: model.dataset.config.flags,
      pickBudget: { ...model.dataset.config.pickBudget, allowFirsts: model.dataset.config.pickBudget.allowFirsts && !keepFirsts },
    });
    const trades = options.map(({ proposal, evaluation }) => ({
      proposal, evaluation, names: evaluationNames(evaluation, model), href: tradeLabHref(leagueId, proposal),
      partner: model.teamsById.get(proposal.sideB.rosterId)!.name,
      sends: proposal.sideA.gives.map((k) => assetName(k, model.tradeContext)),
      receives: proposal.sideB.gives.map((k) => assetName(k, model.tradeContext)),
    }));
    return { trades, message: trades.length ? null : "No packages matched the value band, roster checks, and your pick budget. Try another objective or adjust your trade settings." };
  } catch { return { trades: [], message: "Could not search this league. Please try again." }; }
}
