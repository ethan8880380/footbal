import { z } from "zod";
import type { Prospect } from "./prospects";
import calibration from "./college-model-calibration.json";
import type { ProspectHistory } from "./historical-prospects";
import competitionData from "../data/college-competition.json";
import competitionCalibration from "./competition-calibration.json";
import competitionStrength from "./competition-strength-calibration.json";
import { competitionPoints, type ScheduleStrength } from "./competition";
import { advancedKey, blendAdvanced, type AdvancedProspect } from "./advanced-prospects";
import { DRAFT_CALIBRATION, draftSignal, blendDraftCapital, type DraftSignal } from "./draft-capital";

const number = z.number().finite().nullable();
export const collegeSeasonSchema = z.object({
  year: z.number().int(), teamId: z.string(), school: z.string(),
  games: number, receptions: number, receivingYards: number, receivingTD: number,
  carries: number, rushingYards: number, rushingTD: number,
  attempts: number, completions: number, passingYards: number, passingTD: number, interceptions: number,
  teamPassingYards: number, teamRushingYards: number, teamPassingTD: number,
  sourceUrl: z.string().url(), teamSourceUrl: z.string().url().nullable(),
  gamesSourceUrl: z.string().url().optional(),
});
export type CollegeSeason = z.infer<typeof collegeSeasonSchema>;
export const collegePlayerSchema = z.object({
  prospectId: z.string(), athleteId: z.string(), name: z.string(), school: z.string(),
  position: z.enum(["QB", "RB", "WR", "TE"]),
  headshot: z.string().url().nullable(), height: z.string(), weight: number,
  seasons: z.array(collegeSeasonSchema), fetchedAt: z.string(), sourceUrl: z.string().url(),
});
export type CollegePlayer = z.infer<typeof collegePlayerSchema>;
export interface ModelComponent { label: string; value: number | null; units: string; score: number | null; weight: number; }
export interface SeasonScore { season: CollegeSeason; score: number; productionScore: number; competitionAdjustment: number; scheduleStrength: ScheduleStrength | null; reliability: number; coverage: number; components: ModelComponent[]; }
export interface CollegeModel { score: number | null; tier: string; confidence: "High" | "Medium" | "Low" | "Unscored"; seasons: SeasonScore[]; }
export type CollegeBoardRow = Prospect & { baselineRank: number; baselineScore: number | null; baselineUrl: string; college: CollegePlayer | null; model: CollegeModel; history?: ProspectHistory; advanced: AdvancedProspect | null; advancedWeight: number; draft: DraftSignal | null; collegeScore: number | null };

export const COLLEGE_MODEL_VERSION = DRAFT_CALIBRATION.version;
export const COLLEGE_CALIBRATION = calibration;
export const COMPETITION_CALIBRATION = competitionCalibration;
export const COMPETITION_STRENGTH = competitionStrength;
const schedules = competitionData.seasons as Record<string, Record<string, ScheduleStrength>>;
function scoreTier(score: number | null) { return score === null ? "Unscored" : score >= 80 ? "Standout" : score >= 65 ? "Strong" : score >= 50 ? "Developing" : "Depth"; }
export function ratio(a: number | null, b: number | null) { return a !== null && b !== null && b > 0 ? a / b : null; }
function sum(a: number | null, b: number | null) { return a === null || b === null ? null : a + b; }
function scale(value: number, low: number, high: number) { return Math.max(0, Math.min(100, 100 * (value - low) / (high - low))); }

export function scoreCollegeSeason(season: CollegeSeason, position: Prospect["position"], weights: readonly number[] = calibration.weights[position], competitionCoefficient = competitionStrength.coefficient): SeasonScore | null {
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

export function evaluateCollegePlayer(player: CollegePlayer | null, position: Prospect["position"], weights?: readonly number[], competitionCoefficient = competitionStrength.coefficient): CollegeModel {
  const seasons = (player?.seasons ?? []).map(s => scoreCollegeSeason(s, position, weights, competitionCoefficient)).filter((s): s is SeasonScore => s !== null).sort((a, b) => b.season.year - a.season.year).slice(0, 3);
  if (!seasons.length) return { score: null, tier: "Unscored", confidence: "Unscored", seasons };
  const recency = seasons.length === 1 ? [1] : seasons.length === 2 ? [.65, .35] : [.55, .30, .15];
  const score = Math.round(seasons.reduce((n, s, i) => n + s.score * recency[i], 0) * 10) / 10;
  const newerUnqualifiedSeason = player!.seasons.some(s => s.year > seasons[0].season.year);
  const missingCompetition = competitionCoefficient > 0 && seasons.some(s => !s.scheduleStrength);
  const confidence = newerUnqualifiedSeason || missingCompetition ? "Low" : seasons.length > 1 && seasons[0].reliability >= .75 && seasons.every(s => s.coverage >= .95) ? "High" : seasons[0].reliability >= .4 && seasons[0].coverage >= .8 ? "Medium" : "Low";
  return { score, tier: scoreTier(score), confidence, seasons };
}

export function buildCollegeBoard(prospects: Prospect[], players: CollegePlayer[], format: "1qb" | "sf" = "1qb", analytics: AdvancedProspect[] = [], draftHistory: Record<string, { draftPick: number }> = {}, includeDraft = true): CollegeBoardRow[] {
  const byId = new Map(players.map(p => [p.prospectId, p]));
  const byKey = new Map<string, AdvancedProspect | null>();
  for (const record of analytics) {
    const key = advancedKey(record.name, record.position, record.draftYear);
    byKey.set(key, byKey.has(key) ? null : record);
  }
  const rows = prospects.map(p => {
    const college = byId.get(p.id) ?? null;
    const model = evaluateCollegePlayer(college, p.position);
    const advanced = byKey.get(advancedKey(p.name, p.position, p.draftYear)) ?? null;
    const blended = blendAdvanced(model.score, advanced);
    const draft = includeDraft ? draftSignal(p.position, draftHistory[p.id]?.draftPick, p.projection) : null;
    const capitalScore = blendDraftCapital(blended.score, draft);
    if (draft?.kind === "Projection" && model.confidence === "High") model.confidence = "Medium";
    if (blended.weight > 0 && model.confidence === "High") model.confidence = "Medium"; // Provider summaries omit route sample counts.
    // This is an explicit roster-value adjustment, not a learned hit probability.
    const formatScore = (value: number | null) => value === null ? null : Math.max(0, value - (p.position === "QB" && format === "1qb" ? 8 : 0));
    const score = formatScore(capitalScore);
    return { ...p, baselineRank: p.rank, baselineScore: p.overall, baselineUrl: p.sourceUrl, college, model, advanced, advancedWeight: blended.weight, draft, collegeScore: formatScore(blended.score),
      name: college?.name ?? p.name, school: college?.school ?? p.school,
      overall: score, tier: scoreTier(score), grade: null, zScore: null, forty: null, draftAge: null,
      height: college?.height ?? "", weight: college?.weight ?? null,
      source: college ? "ESPN" : "Awaiting ESPN data", sourceUrl: college?.sourceUrl ?? p.sourceUrl,
      asOf: college?.fetchedAt.slice(0, 10) ?? p.asOf,
    };
  });
  return rows.sort((a, b) => a.draftYear - b.draftYear || (b.overall ?? -1) - (a.overall ?? -1) || a.name.localeCompare(b.name)).map((r, i, all) => ({ ...r, rank: i - all.findIndex(p => p.draftYear === r.draftYear) + 1 }));
}

