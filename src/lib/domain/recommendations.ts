import type { Recommendation, Strategy } from "./types";

export type AgePhase = "rising" | "prime" | "decline";
export type EvidenceStrength = "strong" | "moderate" | "limited";

export const EVIDENCE_STRENGTH_LABELS: Record<EvidenceStrength, string> = {
  strong: "Strong evidence",
  moderate: "Moderate evidence",
  limited: "Limited evidence",
};

/** Ages at which each position enters its prime and its decline phase. Heuristic; documented in README. */
export const AGE_CURVES: Record<string, { prime: number; decline: number }> = {
  QB: { prime: 26, decline: 33 },
  RB: { prime: 23, decline: 27 },
  WR: { prime: 24, decline: 29 },
  TE: { prime: 25, decline: 30 },
  DL: { prime: 24, decline: 29 },
  LB: { prime: 24, decline: 29 },
  DB: { prime: 24, decline: 29 },
};

export const RECOMMENDATION_THRESHOLDS = { keep: 1.25, shop: -0.75 };

const TIMELINE_POINTS: Record<Strategy, Record<AgePhase, number>> = {
  contending: { rising: 0, prime: 1, decline: 0 },
  balanced: { rising: 0.5, prime: 0.5, decline: -0.5 },
  rebuilding: { rising: 1, prime: 0, decline: -1.5 },
};

const PRODUCTION_WEIGHT: Record<Strategy, number> = { contending: 1.5, balanced: 1, rebuilding: 0.5 };

export interface Reason {
  text: string;
  evidenceIds: string[];
  /** Absolute score contribution; used to order reasons and pick the headline. */
  weight?: number;
}

export interface RecommendationInput {
  position: string | null;
  age: number | null;
  marketValue: number | null;
  marketChange30d: number | null;
  productionPercentile: number | null;
  productionPeers: number;
  gamesPlayed: number | null;
  teamGames: number | null;
  isMyStarter: boolean;
  /** Whether the player is on the user's roster; controls second- vs third-person wording. */
  isMine?: boolean;
  positionSurplus: number;
  strategy: Strategy;
  hasStatsIdentity: boolean;
  evidence: {
    market: string | null;
    ppg: string | null;
    games: string | null;
    age: string | null;
  };
}

export interface ScoreComponent {
  key: "timeline" | "production" | "roster" | "market";
  label: string;
  points: number;
  note: string;
}

export interface RecommendationResult {
  recommendation: Recommendation;
  headline: string;
  strengths: Reason[];
  concerns: Reason[];
  changeTriggers: string[];
  evidenceStrength: EvidenceStrength;
  score: number | null;
  components: ScoreComponent[];
}

export function agePhase(position: string | null, age: number | null): AgePhase | null {
  if (!position || age === null) return null;
  const curve = AGE_CURVES[position];
  if (!curve) return null;
  if (age < curve.prime) return "rising";
  if (age < curve.decline) return "prime";
  return "decline";
}

export function evidenceStrength(input: Pick<RecommendationInput, "gamesPlayed" | "hasStatsIdentity" | "marketValue">): EvidenceStrength {
  if (!input.hasStatsIdentity || input.marketValue === null) return "limited";
  const games = input.gamesPlayed ?? 0;
  if (games >= 6) return "strong";
  if (games >= 3) return "moderate";
  return "limited";
}

export function recommend(input: RecommendationInput): RecommendationResult {
  const strength = evidenceStrength(input);
  if (input.marketValue === null) {
    return {
      recommendation: "insufficient",
      headline: "No market value in this league's format, so it is excluded from scored recommendations.",
      strengths: [],
      concerns: [{ text: "Provider has no value for this player in this format.", evidenceIds: [] }],
      changeTriggers: ["A provider value or a CSV-imported value for this format."],
      evidenceStrength: "limited",
      score: null,
      components: [],
    };
  }

  const strengths: Reason[] = [];
  const concerns: Reason[] = [];
  const components: ScoreComponent[] = [];
  const changeTriggers: string[] = [];
  const ids = (...list: (string | null)[]) => list.filter((id): id is string => id !== null);

  const phase = agePhase(input.position, input.age);
  if (phase) {
    const points = TIMELINE_POINTS[input.strategy][phase];
    const note = `${phaseLabel(phase)} for a ${input.position} at ${input.age?.toFixed(1)}`;
    components.push({ key: "timeline", label: "Timeline fit", points, note });
    if (points > 0) strengths.push({ text: `${note}, which suits a ${strategyNoun(input.strategy)} roster.`, evidenceIds: ids(input.evidence.age), weight: points });
    if (points < 0) concerns.push({ text: `${note}; the window conflicts with a ${strategyNoun(input.strategy)} plan.`, evidenceIds: ids(input.evidence.age), weight: -points });
  }

  const pct = input.productionPercentile;
  if (pct !== null) {
    const base = pct >= 0.75 ? 1 : pct >= 0.5 ? 0.5 : pct >= 0.25 ? 0 : -0.5;
    const points = base * PRODUCTION_WEIGHT[input.strategy];
    const rank = `${ordinalPct(pct)} percentile in points per game among ${input.productionPeers} rostered ${input.position}s`;
    components.push({ key: "production", label: "Production", points, note: rank });
    if (base > 0) strengths.push({ text: `${capitalize(rank)}.`, evidenceIds: ids(input.evidence.ppg, input.evidence.games), weight: points + 0.01 });
    if (base < 0) concerns.push({ text: `Only ${rank}.`, evidenceIds: ids(input.evidence.ppg, input.evidence.games), weight: -points + 0.01 });
    if (pct < 0.75 && pct >= 0.4) changeTriggers.push(`Production rising above the 75th percentile (now ${ordinalPct(pct)}) would strengthen the case to keep.`);
  } else {
    components.push({ key: "production", label: "Production", points: 0, note: "No scored games in the current window" });
    concerns.push({ text: "No NFL production in the current stats window.", evidenceIds: ids(input.evidence.games), weight: 0.25 });
  }

  const mine = input.isMine ?? true;
  let rosterPoints = 0;
  if (input.isMyStarter) {
    rosterPoints += 0.75;
    strengths.push({ text: `Starts in ${mine ? "your" : "his team's"} strongest valid lineup by market value.`, evidenceIds: ids(input.evidence.market), weight: 0.75 });
    changeTriggers.push(`Falling out of ${mine ? "your" : "his team's"} starting lineup would weaken the case to keep.`);
  } else if (input.positionSurplus > 1) {
    rosterPoints -= 0.5;
    concerns.push({
      text: `${mine ? "You carry" : "His team carries"} ${input.positionSurplus} more ${input.position}s than ${mine ? "your" : "its"} lineup needs; he is depth, not a starter.`,
      evidenceIds: [],
      weight: 0.5,
    });
  }
  if (rosterPoints !== 0 || input.isMyStarter) {
    components.push({ key: "roster", label: "Roster fit", points: rosterPoints, note: input.isMyStarter ? "Starter" : "Surplus depth" });
  }

  const change = input.marketChange30d !== null && input.marketValue > 0 ? input.marketChange30d / input.marketValue : null;
  if (change !== null) {
    let points = 0;
    if (change >= 0.15 && (pct ?? 0) < 0.5) {
      points = -0.5;
      concerns.push({ text: `Market value rose ${Math.round(change * 100)}% in 30 days without matching production, a possible sell window.`, evidenceIds: ids(input.evidence.market, input.evidence.ppg), weight: 0.5 });
    } else if (change <= -0.15 && (pct ?? 0) >= 0.5) {
      points = 0.5;
      strengths.push({ text: `Market value fell ${Math.abs(Math.round(change * 100))}% in 30 days while production held up; selling now means selling low.`, evidenceIds: ids(input.evidence.market, input.evidence.ppg), weight: 0.5 });
    }
    if (points !== 0) components.push({ key: "market", label: "Market trend", points, note: `${Math.round(change * 100)}% over 30 days` });
  }

  const score = components.reduce((total, c) => total + c.points, 0);
  const recommendation: Recommendation =
    score >= RECOMMENDATION_THRESHOLDS.keep ? "keep" : score <= RECOMMENDATION_THRESHOLDS.shop ? "shop" : "monitor";

  if (strength === "limited") changeTriggers.push("Three or more games of usage data would firm up this read.");
  if (recommendation === "shop" && phase === "decline") changeTriggers.push("Switching to a contending strategy would reduce the age penalty.");
  if (recommendation === "monitor") {
    changeTriggers.push(`The score sits between Shop (${RECOMMENDATION_THRESHOLDS.shop}) and Keep (${RECOMMENDATION_THRESHOLDS.keep}); one more clear signal would decide it.`);
  }

  const byWeight = (a: Reason, b: Reason) => (b.weight ?? 0) - (a.weight ?? 0);
  strengths.sort(byWeight);
  concerns.sort(byWeight);

  return {
    recommendation,
    headline: headline(recommendation, strengths, concerns),
    strengths,
    concerns,
    changeTriggers,
    evidenceStrength: strength,
    score: Math.round(score * 100) / 100,
    components,
  };
}

function headline(recommendation: Recommendation, strengths: Reason[], concerns: Reason[]) {
  const [strength, concern] = [strengths[0], concerns[0]];
  if (recommendation === "keep") return (strength ?? concern)?.text ?? "Signals are mixed.";
  if (recommendation === "shop") return (concern ?? strength)?.text ?? "Signals are mixed.";
  if (strength && concern) return `${strength.text.replace(/\.$/, "")}, but ${lowerFirst(concern.text)}`;
  return (strength ?? concern)?.text ?? "Signals are mixed.";
}

function lowerFirst(text: string) {
  return /^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function phaseLabel(phase: AgePhase) {
  return phase === "rising" ? "Pre-prime" : phase === "prime" ? "In his prime" : "Past the typical prime";
}

function strategyNoun(strategy: Strategy) {
  return strategy === "contending" ? "contending" : strategy === "rebuilding" ? "rebuilding" : "balanced";
}

export function ordinalPct(pct: number) {
  const n = Math.round(pct * 100);
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
