import type { Recommendation } from "@/lib/domain/types";
import type { LeagueModel } from "./league-model";

export interface SnapshotPlayer {
  name: string;
  value: number | null;
  recommendation: Recommendation;
  team: string | null;
  injury: string | null;
  owner: string | null;
}

export interface LeagueSnapshot {
  version: 1;
  myRosterId: string | null;
  marketValuedAt: string | null;
  statsCutoff: string | null;
  players: Record<string, SnapshotPlayer>;
  picks: Record<string, string>;
}

export function buildSnapshot(model: LeagueModel): LeagueSnapshot {
  const players: Record<string, SnapshotPlayer> = {};
  for (const p of model.players.values()) {
    players[p.playerId] = {
      name: p.name,
      value: p.market?.value ?? null,
      recommendation: p.recommendation.recommendation,
      team: p.team,
      injury: p.player?.injuryStatus ?? null,
      owner: p.ownerRosterId,
    };
  }
  return {
    version: 1,
    myRosterId: model.myTeam?.rosterId ?? null,
    marketValuedAt: model.dataset.market?.valuedAt ?? null,
    statsCutoff: [...model.players.values()].find((p) => p.season?.dataCutoff)?.season?.dataCutoff ?? null,
    players,
    picks: Object.fromEntries(model.pickInventory.picks.map((p) => [p.key, p.ownerRosterId])),
  };
}

export type ChangeKind = "value" | "recommendation" | "team" | "injury" | "ownership" | "pick";

export interface MaterialChange {
  kind: ChangeKind;
  subjectId: string;
  title: string;
  detail: string;
  mine: boolean;
}

export const VALUE_CHANGE_THRESHOLD = 0.1;

/** Compares two saved snapshots. Only differences actually observed between them are reported. */
export function diffSnapshots(previous: LeagueSnapshot, current: LeagueSnapshot, teamName: (rosterId: string | null) => string): MaterialChange[] {
  const changes: MaterialChange[] = [];
  const myRoster = current.myRosterId;
  for (const [id, now] of Object.entries(current.players)) {
    const before = previous.players[id];
    const mine = now.owner === myRoster || before?.owner === myRoster;
    if (!before) {
      changes.push({ kind: "ownership", subjectId: id, title: now.name, detail: `Added to ${teamName(now.owner)}.`, mine });
      continue;
    }
    if (before.owner !== now.owner) {
      changes.push({ kind: "ownership", subjectId: id, title: now.name, detail: `Moved from ${teamName(before.owner)} to ${teamName(now.owner)}.`, mine });
    }
    if (before.value !== null && now.value !== null && before.value > 0) {
      const delta = (now.value - before.value) / before.value;
      if (Math.abs(delta) >= VALUE_CHANGE_THRESHOLD) {
        changes.push({
          kind: "value",
          subjectId: id,
          title: now.name,
          detail: `Market value ${delta > 0 ? "up" : "down"} ${Math.abs(Math.round(delta * 100))}% (${Math.round(before.value)} → ${Math.round(now.value)}).`,
          mine,
        });
      }
    }
    if (mine && before.recommendation !== now.recommendation) {
      changes.push({ kind: "recommendation", subjectId: id, title: now.name, detail: `Recommendation changed from ${before.recommendation} to ${now.recommendation}.`, mine });
    }
    if (before.team !== now.team) {
      changes.push({ kind: "team", subjectId: id, title: now.name, detail: `NFL team changed from ${before.team ?? "none"} to ${now.team ?? "none"}.`, mine });
    }
    if (before.injury !== now.injury) {
      changes.push({ kind: "injury", subjectId: id, title: now.name, detail: now.injury ? `Now listed ${now.injury}.` : `No longer listed ${before.injury}.`, mine });
    }
  }
  for (const [id, before] of Object.entries(previous.players)) {
    if (!current.players[id]) {
      changes.push({ kind: "ownership", subjectId: id, title: before.name, detail: `No longer rostered by ${teamName(before.owner)}.`, mine: before.owner === myRoster });
    }
  }
  for (const [key, owner] of Object.entries(current.picks)) {
    const before = previous.picks[key];
    if (before && before !== owner) {
      changes.push({ kind: "pick", subjectId: key, title: key, detail: `Pick moved from ${teamName(before)} to ${teamName(owner)}.`, mine: before === myRoster || owner === myRoster });
    }
  }
  return changes.sort((a, b) => Number(b.mine) - Number(a.mine));
}
