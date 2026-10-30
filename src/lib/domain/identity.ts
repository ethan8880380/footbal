import type { IdentityRecord, MappingIssue } from "./types";

export interface IdentitySourcePlayer {
  playerId: string;
  gsisId: string | null;
  sportradarId: string | null;
}

export interface CrosswalkEntry {
  sleeperId: string | null;
  gsisId: string | null;
  pfrId: string | null;
  sportradarId: string | null;
}

export interface GsisPfrEntry {
  gsisId: string;
  pfrId: string | null;
}

/**
 * Resolves Sleeper IDs to GSIS and PFR IDs through stable identifiers only.
 * Names are never used; conflicting IDs leave the field null and record an issue.
 */
export function resolveIdentities(
  players: IdentitySourcePlayer[],
  crosswalk: CrosswalkEntry[],
  gsisToPfr: GsisPfrEntry[],
  reportUnresolvedFor: Set<string>,
): { identities: IdentityRecord[]; issues: MappingIssue[] } {
  const bySleeper = groupBy(crosswalk.filter((r) => r.sleeperId), (r) => r.sleeperId!);
  const bySportradar = groupBy(crosswalk.filter((r) => r.sportradarId), (r) => r.sportradarId!);
  const pfrByGsis = new Map(gsisToPfr.filter((r) => r.pfrId).map((r) => [r.gsisId, r.pfrId!]));

  const identities: IdentityRecord[] = [];
  const issues: MappingIssue[] = [];

  for (const player of players) {
    const sleeperGsis = clean(player.gsisId);
    let via = "unresolved";
    let row: CrosswalkEntry | null = null;

    const sleeperRows = bySleeper.get(player.playerId) ?? [];
    if (distinct(sleeperRows.map((r) => r.gsisId)).length > 1) {
      issues.push({ sleeperId: player.playerId, kind: "crosswalk_conflict", detail: "Crosswalk lists several GSIS IDs for this Sleeper ID." });
    } else if (sleeperRows.length > 0) {
      row = sleeperRows[0];
      via = "crosswalk:sleeper_id";
    } else if (player.sportradarId) {
      const sportradarRows = bySportradar.get(player.sportradarId) ?? [];
      if (sportradarRows.length === 1 && (!sportradarRows[0].sleeperId || sportradarRows[0].sleeperId === player.playerId)) {
        row = sportradarRows[0];
        via = "crosswalk:sportradar_id";
      }
    }

    let gsisId = clean(row?.gsisId ?? null);
    if (gsisId && sleeperGsis && gsisId !== sleeperGsis) {
      issues.push({ sleeperId: player.playerId, kind: "gsis_conflict", detail: `Crosswalk GSIS ${gsisId} disagrees with Sleeper GSIS ${sleeperGsis}.` });
      gsisId = null;
    } else if (!gsisId && sleeperGsis) {
      gsisId = sleeperGsis;
      via = row ? via : "sleeper:gsis_id";
    }

    const crosswalkPfr = clean(row?.pfrId ?? null);
    const nflversePfr = gsisId ? pfrByGsis.get(gsisId) ?? null : null;
    let pfrId = crosswalkPfr ?? nflversePfr;
    if (crosswalkPfr && nflversePfr && crosswalkPfr !== nflversePfr) {
      issues.push({ sleeperId: player.playerId, kind: "pfr_conflict", detail: `Crosswalk PFR ${crosswalkPfr} disagrees with nflverse PFR ${nflversePfr}.` });
      pfrId = null;
    }

    if (!gsisId && reportUnresolvedFor.has(player.playerId) && !issues.some((i) => i.sleeperId === player.playerId)) {
      issues.push({ sleeperId: player.playerId, kind: "unresolved", detail: "No GSIS ID found through Sleeper, Sportradar, or crosswalk IDs." });
    }
    identities.push({ sleeperId: player.playerId, gsisId, pfrId, resolvedVia: gsisId ? via : "unresolved" });
  }
  return { identities, issues };
}

function clean(id: string | null) {
  const trimmed = id?.trim();
  return trimmed ? trimmed : null;
}

function distinct(values: (string | null)[]) {
  return [...new Set(values.filter((v): v is string => v !== null))];
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return map;
}
