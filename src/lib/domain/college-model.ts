import { z } from "zod";
import type { Prospect } from "./prospects";
import calibration from "./college-model-calibration.json";
import type { ProspectHistory } from "./historical-prospects";
import competitionData from "../data/college-competition.json";
import competitionCalibration from "./competition-calibration.json";
import competitionStrength from "./competition-strength-calibration.json";
import { competitionPoints, type ScheduleStrength } from "./competition";
import { advancedKey, blendAdvanced, type AdvancedProspect } from "./advanced-prospects";
import { GRADE_MODEL_CALIBRATION, predictGrade } from "./grade-model";
import { DEFENSE_CALIBRATION, isDefensePosition, predictDefense, type DefensePosition } from "./defense-model";
import { BAKERY_CALIBRATION, indexBakeryGrades, type BakeryGrade } from "./bakery-grades";
import { draftSignal, blendDraftCapital, type DraftSignal } from "./draft-capital";

const number = z.number().finite().nullable();
export const collegeSeasonSchema = z.object({
  year: z.number().int(), teamId: z.string(), school: z.string(),
  games: number, receptions: number, receivingYards: number, receivingTD: number,
  carries: number, rushingYards: number, rushingTD: number,
  attempts: number, completions: number, passingYards: number, passingTD: number, interceptions: number,
  teamPassingYards: number, teamRushingYards: number, teamPassingTD: number,
  sourceUrl: z.string().url(), teamSourceUrl: z.string().url().nullable(),
  gamesSourceUrl: z.string().url().optional(),
  defense: z.object({ tackles: z.number(), solo: z.number(), assists: z.number(), sacks: z.number(), forcedFumbles: z.number(), interceptions: z.number(), passesDefended: z.number() }).optional(),
});
export type CollegeSeason = z.infer<typeof collegeSeasonSchema>;
export const collegePlayerSchema = z.object({
  prospectId: z.string(), athleteId: z.string(), name: z.string(), school: z.string(),
  position: z.enum(["QB", "RB", "WR", "TE", "DL", "LB", "DB"]),
  headshot: z.string().url().nullable(), height: z.string(), weight: number,
  seasons: z.array(collegeSeasonSchema), fetchedAt: z.string(), sourceUrl: z.string().url(),
});
export type CollegePlayer = z.infer<typeof collegePlayerSchema>;
export interface ModelComponent { label: string; value: number | null; units: string; score: number | null; weight: number; }
export interface SeasonScore { season: CollegeSeason; score: number; productionScore: number; competitionAdjustment: number; scheduleStrength: ScheduleStrength | null; reliability: number; coverage: number; components: ModelComponent[]; }
export interface CollegeModel { score: number | null; tier: string; confidence: "High" | "Medium" | "Low" | "Unscored"; seasons: SeasonScore[]; }
export type CollegeBoardRow = Prospect & { baselineRank: number; baselineScore: number | null; baselineUrl: string; college: CollegePlayer | null; model: CollegeModel; history?: ProspectHistory; advanced: AdvancedProspect | null; advancedWeight: number; bakery: BakeryGrade | null; gradeSource: "published" | "predicted" | "college"; draft: DraftSignal | null; collegeScore: number | null };

export type OffensePosition = "QB" | "RB" | "WR" | "TE";
export const COLLEGE_MODEL_VERSION = BAKERY_CALIBRATION.version;
export const COLLEGE_CALIBRATION = calibration;
export const COMPETITION_CALIBRATION = competitionCalibration;
export const COMPETITION_STRENGTH = competitionStrength;
const schedules = competitionData.seasons as Record<string, Record<string, ScheduleStrength>>;
function scoreTier(score: number | null) { return score === null ? "Unscored" : score >= 80 ? "Standout" : score >= 65 ? "Strong" : score >= 50 ? "Developing" : "Depth"; }
export function ratio(a: number | null, b: number | null) { return a !== null && b !== null && b > 0 ? a / b : null; }
function sum(a: number | null, b: number | null) { return a === null || b === null ? null : a + b; }
function scale(value: number, low: number, high: number) { return Math.max(0, Math.min(100, 100 * (value - low) / (high - low))); }

export function scoreCollegeSeason(season: CollegeSeason, position: OffensePosition, weights: readonly number[] = calibration.weights[position], competitionCoefficient = competitionStrength.coefficient): SeasonScore | null {
  const s = season;
  const opportunities = position === "QB" ? s.attempts : position === "RB" ? sum(s.carries, s.receptions) : s.receptions;
  if (s.games === null || s.games < 3 || opportunities === null || opportunities < (position === "QB" ? 30 : 10)) return null;
  const components: ModelComponent[] = [];
  const add = (label: string, value: number | null, units: string, weight: number, low: number, high: number) => components.push({ label, value, units, weight, score: value === null ? null : scale(value, low, high) });
  if (position === "WR" || position === "TE") {
    const te = position === "TE";
    add("Receiving yard share", ratio(s.receivingYards, s.teamPassingYards), "%", .35, te ? .04 : .08, te ? .28 : .40);
    add("Receiving yards / game", ratio(s.receivingYards, s.games), "yd", .30, te ? 10 : 20, te ? 80 : 115);
    add("Receptions / game", ratio(s.receptions, s.games), "rec", .20, te ? 1 : 2, te ? 6 : 8);
    add("Yards / reception", ratio(s.receivingYards, s.receptions), "yd", .15, te ? 7 : 9, te ? 18 : 22);
  } else if (position === "RB") {
    add("Scrimmage yards / game", ratio(sum(s.rushingYards, s.receivingYards), s.games), "yd", .30, 30, 155);
    add("Receiving yards / game", ratio(s.receivingYards, s.games), "yd", .30, 0, 40);
    add("Yards / carry", ratio(s.rushingYards, s.carries), "yd", .20, 3.5, 7);
    add("Team rushing yard share", ratio(s.rushingYards, s.teamRushingYards), "%", .20, .10, .65);
  } else {
    const adjusted = s.passingYards !== null && s.passingTD !== null && s.interceptions !== null ? s.passingYards + 20 * s.passingTD - 45 * s.interceptions : null;
    add("Adjusted yards / attempt", ratio(adjusted, s.attempts), "yd", .45, 4, 11);
    add("Completion rate", ratio(s.completions, s.attempts), "%", .20, .50, .75);
    add("Rushing yards / game", ratio(s.rushingYards, s.games), "yd", .20, 0, 65);
    add("Passing yards / game", ratio(s.passingYards, s.games), "yd", .15, 120, 340);
  }
  const coverage = components.reduce((n, c) => n + (c.score === null ? 0 : c.weight), 0);
  if (coverage < .60) return null;
  // Keep v1 coverage eligibility fixed so changing weights cannot silently drop difficult observations.
  components.forEach((component, i) => { component.weight = weights[i]; });
  // Missing metrics get a conservative neutral value; never substitute a zero observation.
  const raw = components.reduce((n, c) => n + (c.score ?? 35) * c.weight, 0);
  const reliability = Math.min(1, s.games / 8) * Math.min(1, opportunities / (position === "QB" ? 200 : position === "RB" ? 120 : position === "TE" ? 30 : 45));
  const productionScore = 35 + (raw - 35) * Math.sqrt(reliability);
  const found = schedules[s.year]?.[s.teamId];
  const scheduleStrength = found && found.games >= 4 ? found : null;
  const competitionAdjustment = competitionPoints(scheduleStrength ?? undefined, competitionCoefficient, reliability, competitionStrength.reference, competitionStrength.cap);
  const score = Math.max(0, Math.min(100, productionScore + competitionAdjustment));
  return { season: s, score, productionScore, competitionAdjustment, scheduleStrength, reliability, coverage, components };
}

export function evaluateCollegePlayer(player: CollegePlayer | null, position: OffensePosition, weights?: readonly number[], competitionCoefficient = competitionStrength.coefficient): CollegeModel {
  const seasons = (player?.seasons ?? []).map(s => scoreCollegeSeason(s, position, weights, competitionCoefficient)).filter((s): s is SeasonScore => s !== null).sort((a, b) => b.season.year - a.season.year).slice(0, 3);
  if (!seasons.length) return { score: null, tier: "Unscored", confidence: "Unscored", seasons };
  const recency = seasons.length === 1 ? [1] : seasons.length === 2 ? [.65, .35] : [.55, .30, .15];
  const score = Math.round(seasons.reduce((n, s, i) => n + s.score * recency[i], 0) * 10) / 10;
  const newerUnqualifiedSeason = player!.seasons.some(s => s.year > seasons[0].season.year);
  const missingCompetition = competitionCoefficient > 0 && seasons.some(s => !s.scheduleStrength);
  const confidence = newerUnqualifiedSeason || missingCompetition ? "Low" : seasons.length > 1 && seasons[0].reliability >= .75 && seasons.every(s => s.coverage >= .95) ? "High" : seasons[0].reliability >= .4 && seasons[0].coverage >= .8 ? "Medium" : "Low";
  return { score, tier: scoreTier(score), confidence, seasons };
}

function inches(height: string | undefined) { const m = /(\d+)\D+(\d+)/.exec(height ?? ""); return m ? Number(m[1]) * 12 + Number(m[2]) : null; }
/** Defenders have no offensive season model; their scouting score comes from the trained defense fit. */
function defenseScout(position: DefensePosition, college: CollegePlayer | null) {
  const seasons = (college?.seasons ?? []).flatMap(s => s.defense && s.games ? [{ year: s.year, games: s.games, ...s.defense }] : []);
  return DEFENSE_CALIBRATION.usable[position] ? predictDefense(position, { seasons, height: inches(college?.height), weight: college?.weight ?? null }) : null;
}
function defenseModel(position: DefensePosition, college: CollegePlayer | null, spread?: number): CollegeModel {
  const scout = defenseScout(position, college), score = spread ?? scout?.score ?? null;
  return { score, tier: scoreTier(score), confidence: scout ? "Low" : "Unscored", seasons: [] };
}
/** Unpicked defenders are a pre-selected pool, so percentiles against drafted players saturate at 100; rank them within their own class instead. */
function spreadUnpicked(prospects: Prospect[], byId: Map<string, CollegePlayer>, draftHistory: Record<string, { draftPick: number }>) {
  const groups = new Map<string, { id: string; raw: number }[]>();
  for (const p of prospects) {
    if (!isDefensePosition(p.position) || draftHistory[p.id]) continue;
    const scout = defenseScout(p.position, byId.get(p.id) ?? null);
    if (scout) groups.set(`${p.draftYear}:${p.position}`, [...(groups.get(`${p.draftYear}:${p.position}`) ?? []), { id: p.id, raw: scout.raw }]);
  }
  const spread = new Map<string, number>();
  for (const group of groups.values()) group.sort((a, b) => a.raw - b.raw).forEach((x, i) => spread.set(x.id, group.length === 1 ? 50 : Math.round((5 + 90 * i / (group.length - 1)) * 10) / 10));
  return spread;
}

export function buildCollegeBoard(prospects: Prospect[], players: CollegePlayer[], format: "1qb" | "sf" = "1qb", analytics: AdvancedProspect[] = [], draftHistory: Record<string, { draftPick: number }> = {}, includeDraft = true, grades: BakeryGrade[] = []): CollegeBoardRow[] {
  const gradeIndex = indexBakeryGrades(grades);
  const byId = new Map(players.map(p => [p.prospectId, p]));
  const byKey = new Map<string, AdvancedProspect | null>();
  for (const record of analytics) {
    const key = advancedKey(record.name, record.position, record.draftYear);
    byKey.set(key, byKey.has(key) ? null : record);
  }
  const spread = spreadUnpicked(prospects, byId, draftHistory);
  const rows = prospects.map(p => {
    const college = byId.get(p.id) ?? null;
    const pick = draftHistory[p.id]?.draftPick;
    const position = p.position;
    const defense = isDefensePosition(position);
    const model = defense ? defenseModel(position, college, spread.get(p.id)) : evaluateCollegePlayer(college, position as OffensePosition);
    const advanced = defense ? null : byKey.get(advancedKey(p.name, p.position, p.draftYear)) ?? null;
    const blended = defense ? { score: model.score, weight: 0 } : blendAdvanced(model.score, advanced);
    // A published grade replaces the production-only base; classes without one keep the independent college model.
    const bakery = defense ? null : gradeIndex.get(advancedKey(p.name, p.position, p.draftYear)) ?? null;
    const predicted = bakery || defense ? null : predictGrade({ position: position as OffensePosition, model, advanced, draftAge: p.draftAge });
    const base = bakery ? bakery.overall : predicted ? predicted.overall : blended.score;
    const capitalWeight = defense ? DEFENSE_CALIBRATION.weights[position] : bakery ? BAKERY_CALIBRATION.weights[position as OffensePosition] : predicted ? GRADE_MODEL_CALIBRATION.weights[position as keyof typeof GRADE_MODEL_CALIBRATION.weights] : undefined;
    const draft = includeDraft ? draftSignal(position, pick, p.projection, capitalWeight) : null;
    // Without a validated scouting score the draft signal is the only evidence a defender has.
    const capitalScore = defense && base === null ? draft?.score ?? null : blendDraftCapital(base, draft);
    if (draft?.kind === "Projection" && model.confidence === "High") model.confidence = "Medium";
    if (blended.weight > 0 && model.confidence === "High") model.confidence = "Medium"; // Provider summaries omit route sample counts.
    // This is an explicit roster-value adjustment, not a learned hit probability.
    const formatScore = (value: number | null) => value === null ? null : Math.max(0, value - (p.position === "QB" && format === "1qb" ? 8 : 0));
    const score = formatScore(capitalScore);
    return { ...p, baselineRank: p.rank, baselineScore: p.overall, baselineUrl: p.sourceUrl, college, model, advanced, advancedWeight: blended.weight, draft, collegeScore: formatScore(base), bakery, gradeSource: (bakery ? "published" : predicted || (defense && base !== null) ? "predicted" : "college") as CollegeBoardRow["gradeSource"],
      name: college?.name ?? p.name, school: college?.school ?? p.school,
      overall: score, tier: scoreTier(score), grade: null, zScore: null, forty: null, draftAge: null,
      height: college?.height ?? "", weight: college?.weight ?? null,
      source: college ? "ESPN" : "Awaiting ESPN data", sourceUrl: college?.sourceUrl ?? p.sourceUrl,
      asOf: college?.fetchedAt.slice(0, 10) ?? p.asOf,
    };
  });
  return rows.sort((a, b) => a.draftYear - b.draftYear || (b.overall ?? -1) - (a.overall ?? -1) || a.name.localeCompare(b.name)).map((r, i, all) => ({ ...r, rank: i - all.findIndex(p => p.draftYear === r.draftYear) + 1 }));
}

