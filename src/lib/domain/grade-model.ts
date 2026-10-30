import type { CollegeModel } from "./college-model";
import type { AdvancedProspect } from "./advanced-prospects";
import calibration from "./grade-model-calibration.json";

export type GradePosition = "QB" | "RB" | "WR" | "TE";
export interface GradeInputs { position: GradePosition; model: CollegeModel; advanced: AdvancedProspect | null; draftAge: number | null; }
interface PositionFit { names: string[]; mean: number[]; sd: number[]; coef: number[]; intercept: number; knots: [number, number][]; }

export const GRADE_MODEL_CALIBRATION = calibration;
const ADVANCED_KEYS: Record<GradePosition, string[]> = {
  QB: ["BOUT", "Speed", "Comp", "ADJ%", "BTT%", "TWP%", "DAA", "YPA", "MTF/A", "YCO/A"],
  RB: ["BOUT", "Speed", "BMI", "MTF/A", "YPC", "YPR", "RPT", "ELU", "YCO/A", "Break %"],
  WR: ["Breakout", "Y/RR", "T/RR", "YAC/R", "aDOT", "EPA/P", "CTPRR", "UCTPRR", "Drop%", "Speed"],
  TE: ["BOUT", "Y/RR", "YAC/R", "aDOT", "Drop%", "RT%", "PB%", "Speed"],
};

const EMPTY_SEASON = { games: null, receptions: null, receivingYards: null, receivingTD: null, carries: null, rushingYards: null, rushingTD: null, attempts: null, completions: null, passingYards: null, passingTD: null, interceptions: null, teamPassingYards: null, teamRushingYards: null, teamPassingTD: null } as unknown as CollegeModel["seasons"][number]["season"];
function div(a: number | null | undefined, b: number | null | undefined) { return a == null || b == null || b <= 0 ? null : a / b; }
function add(a: number | null, b: number | null) { return a === null || b === null ? null : a + b; }

/** Scale-free features from the seasons that qualified for the college model; null means unobserved. */
export function gradeFeatures({ position, model, advanced, draftAge }: GradeInputs): { names: string[]; values: (number | null)[] } {
  const seasons = model.seasons.map(s => s.season), s = seasons[0] ?? EMPTY_SEASON, previous = seasons[1];
  const scrim = (x: typeof s | undefined) => x ? add(x.rushingYards, x.receivingYards) : null;
  const teamYards = (x: typeof s | undefined) => x ? add(x.teamPassingYards, x.teamRushingYards) : null;
  const peak = (pick: (x: typeof s) => number | null) => { const v = seasons.map(pick).filter((n): n is number => n !== null); return v.length ? Math.max(...v) : null; };
  const base: [string, number | null][] = [["old_score", model.score], ["draft_age", draftAge], ["seasons", seasons.length || null]];
  const own: [string, number | null][] = position === "RB" ? [
    ["scrim_share", div(scrim(s), teamYards(s))], ["rush_share", div(s.rushingYards, s.teamRushingYards)], ["rec_share", div(s.receivingYards, s.teamPassingYards)],
    ["scrim_pg", div(scrim(s), s.games)], ["rec_pg", div(s.receivingYards, s.games)], ["ypc", div(s.rushingYards, s.carries)], ["ypr", div(s.receivingYards, s.receptions)],
    ["td_pg", div(add(s.rushingTD, s.receivingTD), s.games)], ["touches_pg", div(add(s.carries, s.receptions), s.games)], ["peak_scrim_pg", peak(x => div(scrim(x), x.games))],
    ["prev_scrim_share", div(scrim(previous), teamYards(previous))],
  ] : position === "QB" ? [
    ["aypa", div(s.passingYards === null || s.passingTD === null || s.interceptions === null ? null : s.passingYards + 20 * s.passingTD - 45 * s.interceptions, s.attempts)],
    ["comp", div(s.completions, s.attempts)], ["pass_pg", div(s.passingYards, s.games)], ["rush_pg", div(s.rushingYards, s.games)],
    ["td_rate", div(s.passingTD, s.attempts)], ["int_rate", div(s.interceptions, s.attempts)], ["att_pg", div(s.attempts, s.games)], ["peak_pass_pg", peak(x => div(x.passingYards, x.games))],
  ] : [
    ["rec_share", div(s.receivingYards, s.teamPassingYards)], ["rec_pg", div(s.receivingYards, s.games)], ["catch_pg", div(s.receptions, s.games)], ["ypr", div(s.receivingYards, s.receptions)],
    ["td_share", div(s.receivingTD, s.teamPassingTD)], ["td_pg", div(s.receivingTD, s.games)], ["peak_rec_pg", peak(x => div(x.receivingYards, x.games))], ["prev_rec_share", div(previous?.receivingYards, previous?.teamPassingYards)],
  ];
  const detail: [string, number | null][] = ADVANCED_KEYS[position].map(key => [`adv_${key}`, advanced?.metrics[key] ?? null]);
  const all = [...base, ...own, ...detail];
  return { names: all.map(([name]) => name), values: all.map(([, value]) => value !== null && Number.isFinite(value) ? value : null) };
}

/** Piecewise-linear map from predicted grade to the 0-100 Overall scale, learned from published pairs. */
export function gradeToOverall(knots: [number, number][], grade: number) {
  if (grade <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) {
    const [g1, o1] = knots[i], [g0, o0] = knots[i - 1];
    if (grade <= g1) return g1 === g0 ? o1 : o0 + (o1 - o0) * (grade - g0) / (g1 - g0);
  }
  return knots.at(-1)![1];
}

export function applyGradeFit(fit: PositionFit, features: { names: string[]; values: (number | null)[] }) {
  if (features.names.length !== fit.names.length || features.names.some((n, i) => n !== fit.names[i])) return null;
  // The model needs at least the college index; otherwise the prediction would be the position mean.
  if (features.values[0] === null && features.values.slice(3).every(v => v === null)) return null;
  let grade = fit.intercept;
  features.values.forEach((value, i) => { grade += fit.coef[i] * ((value ?? fit.mean[i]) - fit.mean[i]) / fit.sd[i]; });
  return { grade, overall: gradeToOverall(fit.knots, grade) };
}

/** Predicts a Bakery-scale grade for prospects without a published one. */
export function predictGrade(inputs: GradeInputs) {
  const fit = (calibration.fits as unknown as Record<string, PositionFit | undefined>)[inputs.position];
  return fit ? applyGradeFit(fit, gradeFeatures(inputs)) : null;
}
