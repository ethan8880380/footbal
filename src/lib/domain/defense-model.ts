import calibration from "./defense-model-calibration.json";
import { predictRidge, type RidgeFit } from "./ridge";
export interface DefensiveSeason {
  year: number; games: number;
  tackles: number; solo: number; assists: number; sacks: number; forcedFumbles: number; interceptions: number; passesDefended: number;
}

export type DefensePosition = "DL" | "LB" | "DB";
export const DEFENSE_POSITIONS: readonly DefensePosition[] = ["DL", "LB", "DB"];
export const isDefensePosition = (position: string): position is DefensePosition => (DEFENSE_POSITIONS as readonly string[]).includes(position);
export const DEFENSE_CALIBRATION = calibration;
interface DefenseFit extends RidgeFit { quantiles: number[]; }

export interface DefenseInputs { seasons: DefensiveSeason[]; height: number | null; weight: number | null; }

function div(a: number, b: number) { return b > 0 ? a / b : null; }

/** Per-game rates from the latest season plus career totals; sample size enters through games and seasons. */
export function defenseFeatures({ seasons, height, weight }: DefenseInputs) {
  const ordered = seasons.toSorted((a, b) => b.year - a.year), s = ordered[0];
  const sum = (pick: (x: DefensiveSeason) => number) => ordered.reduce((n, x) => n + pick(x), 0);
  const rate = (pick: (x: DefensiveSeason) => number) => s ? div(pick(s), s.games) : null;
  const values = [
    rate(x => x.tackles), rate(x => x.solo), rate(x => x.assists), rate(x => x.sacks), rate(x => x.forcedFumbles), rate(x => x.interceptions), rate(x => x.passesDefended),
    ordered.length ? Math.max(...ordered.map(x => div(x.tackles, x.games) ?? 0)) : null,
    ordered.length ? sum(x => x.sacks) : null, ordered.length ? sum(x => x.tackles) : null, ordered.length || null, s?.games ?? null,
    height, weight, height && weight ? weight / height ** 2 * 703 : null,
  ];
  return { names: calibration.featureNames, values };
}

/** Predicts a 0-100 scouting score (percentile of first-three-season NFL IDP production among drafted defenders). */
export function predictDefense(position: DefensePosition, inputs: DefenseInputs) {
  const fit = (calibration.fits as unknown as Record<string, DefenseFit | undefined>)[position];
  if (!fit || !inputs.seasons.length) return null;
  const { values } = defenseFeatures(inputs);
  const raw = predictRidge(fit, values), q = fit.quantiles;
  let i = 0;
  while (i < q.length - 1 && raw > q[i + 1]) i++;
  const span = q[Math.min(i + 1, q.length - 1)] - q[i];
  const percentile = raw <= q[0] ? 0 : raw >= q.at(-1)! ? 100 : i + (span > 0 ? (raw - q[i]) / span : 0);
  return { raw, score: Math.round(percentile * (100 / (q.length - 1)) * 10) / 10 };
}
