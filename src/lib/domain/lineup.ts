import { canFillSlot } from "./positions";

export interface LineupCandidate {
  playerId: string;
  positions: string[];
  score: number | null;
}

export interface LineupAssignment {
  slot: string;
  playerId: string | null;
  score: number | null;
}

export interface LineupResult {
  assignments: LineupAssignment[];
  totalScore: number;
  unfilledSlots: string[];
  excluded: string[];
}

/**
 * Optimal assignment of candidates to starter slots. Candidates without a score
 * are excluded rather than treated as zero. Flexible slots are solved jointly,
 * so a player can never occupy two slots.
 */
export function solveLineup(slots: string[], candidates: LineupCandidate[]): LineupResult {
  const scored = candidates.filter((c): c is LineupCandidate & { score: number } => c.score !== null);
  const excluded = candidates.filter((c) => c.score === null).map((c) => c.playerId);
  if (slots.length === 0) return { assignments: [], totalScore: 0, unfilledSlots: [], excluded };

  const columns = scored.length + slots.length;
  const INELIGIBLE = 1e12;
  const cost = slots.map((slot) => {
    const row = new Array<number>(columns).fill(0);
    scored.forEach((candidate, j) => {
      row[j] = canFillSlot(slot, candidate.positions) ? -candidate.score : INELIGIBLE;
    });
    return row;
  });

  const match = hungarian(cost, slots.length, columns);
  const assignments = slots.map((slot, i) => {
    const j = match[i];
    const candidate = j < scored.length && cost[i][j] < INELIGIBLE ? scored[j] : null;
    return { slot, playerId: candidate?.playerId ?? null, score: candidate?.score ?? null };
  });

  return {
    assignments,
    totalScore: assignments.reduce((total, a) => total + (a.score ?? 0), 0),
    unfilledSlots: assignments.filter((a) => a.playerId === null).map((a) => a.slot),
    excluded,
  };
}

/** Kuhn-Munkres for an n x m cost matrix with n <= m. Returns the column per row. */
function hungarian(cost: number[][], n: number, m: number): number[] {
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0);
  const way = new Array<number>(m + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(Infinity);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const current = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (current < minv[j]) {
          minv[j] = current;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const result = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j] !== 0) result[p[j] - 1] = j - 1;
  return result;
}
