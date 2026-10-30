import { ratio, type CollegeBoardRow } from "./college-model";
import { METRIC_LABELS } from "./advanced-prospects";

export type Metric = { key: string; label: string; group: string; unit: string; lower?: boolean; positions: string[]; definition: string };
const all = ["QB", "RB", "WR", "TE"];
const receivers = ["WR", "TE", "RB"];
const metric = (key: string, label: string, group: string, unit: string, positions = all, definition = label, lower = false): Metric => ({ key, label, group, unit, positions, definition, lower });
export const LAB_METRICS: Metric[] = [
  metric("college", "Competition-adjusted college score", "Context", "score"),
  metric("schedule", "Opponent strength", "Context", "pts"),
  metric("games", "Latest season games", "Opportunity", "games"),
  metric("seasons", "College seasons", "Opportunity", "seasons"),
  metric("recpg", "Receiving yards / game", "Production", "yd", receivers),
  metric("catchpg", "Receptions / game", "Opportunity", "rec", receivers),
  metric("rushpg", "Rushing yards / game", "Production", "yd", ["RB", "QB"]),
  metric("touchpg", "Touches / game", "Opportunity", "touch", receivers),
  metric("scrimpg", "Scrimmage yards / game", "Production", "yd", receivers),
  metric("recshare", "Receiving yard share", "Opportunity", "%", receivers),
  metric("rushshare", "Rushing yard share", "Opportunity", "%", ["RB", "QB"]),
  metric("tdshare", "Receiving TD share", "Production", "%", receivers),
  metric("dominator", "Receiving dominator", "Production", "%", receivers, "Mean of receiving yard share and receiving touchdown share; latest season."),
  metric("ypc", "Yards / carry", "Efficiency", "yd", ["RB", "QB"]),
  metric("ypr", "Yards / reception", "Efficiency", "yd", receivers),
  metric("rectouch", "Reception share of touches", "Opportunity", "%", receivers),
  metric("passpg", "Passing yards / game", "Production", "yd", ["QB"]),
  metric("comppct", "Completion rate", "Efficiency", "%", ["QB"]),
  metric("ypa", "Passing yards / attempt", "Efficiency", "yd", ["QB"]),
  metric("aypa", "Adjusted yards / attempt", "Efficiency", "yd", ["QB"], "(Passing yards + 20 × TD − 45 × interceptions) / attempts."),
  metric("tdrate", "Passing TD rate", "Efficiency", "%", ["QB"]),
  metric("intrate", "Interception rate", "Efficiency", "%", ["QB"], "Interceptions / pass attempts.", true),
  metric("peak", "Peak yards / game", "Production", "yd", all, "Best pre-draft season with at least three games; passing for QB, scrimmage for RB, receiving for WR/TE."),
  metric("trend", "Year-over-year yards / game", "Production", "yd", all, "Latest minus previous season yards/game; only consecutive seasons with at least three games."),
  metric("age", "Age at draft-year May 1", "Age & athleticism", "yr", all, "Calculated from nflverse birth date, at May 1 of draft year.", true),
  ...[["height", "Pre-draft height", "in"], ["weight", "Pre-draft weight", "lb"], ["bmi", "Pre-draft BMI", "BMI"], ["forty", "40-yard dash", "s"], ["vertical", "Vertical jump", "in"], ["broad_jump", "Broad jump", "in"], ["cone", "Three-cone drill", "s"], ["shuttle", "20-yard shuttle", "s"], ["bench", "Bench press", "reps"], ["speedScore", "Weight-adjusted speed", "score"]].map(([key, label, unit]) => metric(key, label, "Age & athleticism", unit, all, key === "speedScore" ? "200 × pre-draft weight (lb) / forty time⁴; descriptive, not a position-adjusted grade." : "Archived nflverse pre-draft testing. Venue and timing method are not distinguished; 2021 workouts were pro days. Missing tests remain missing.", ["forty", "cone", "shuttle"].includes(key))),
  ...Object.entries({ "Y/RR": receivers, "T/RR": receivers, UCTPRR: receivers, CTPRR: receivers, "YAC/R": receivers, aDOT: receivers, "CC%": receivers, "Drop%": receivers, "CT%": receivers, "UCT%": receivers, Separation: ["WR"], "Wide %": ["WR"], "Slot %": ["WR"], "RT%": ["TE"], "PB%": ["TE"], "Rec Snps": ["TE"], "MTF/A": ["RB", "QB"], "YCO/A": ["RB", "QB"], RPT: ["RB"], "Break %": ["RB"], "ADJ%": ["QB"], "BTT%": ["QB"], "TWP%": ["QB"], BOUT: ["QB", "RB", "TE"], Breakout: ["WR"] }).map(([key, positions]) => metric(`advanced:${key}`, METRIC_LABELS[key] ?? ({ "CT%": "Contested target rate", "UCT%": "Uncontested target rate", "RT%": "Route participation", "PB%": "Pass-block rate", "Rec Snps": "Receiving snaps", BOUT: "Breakout age", Breakout: "Breakout age" }[key] ?? key), "Charting", /%|PRR|T\/RR|^RPT$/.test(key) ? "%" : "", positions, key === "Separation" ? "Provider target-based separation proxy; not tracking distance." : "Bakery provider summary. Aggregation window and route sample sizes not supplied; historical capture is retrospective.", ["Drop%", "TWP%", "BOUT", "Breakout"].includes(key))),
  metric("capital", "Draft capital score", "Draft", "score", all, "Actual NFL pick transformed along Desk pick anchors. Future projections are scenarios, not observed draft picks."),
];
export const UNAVAILABLE_METRICS = [
  { source: "CFBD · API key required", url: "https://api.collegefootballdata.com/data-availability", metrics: "Opponent-adjusted passing/rushing WEPA, play EPA/PPA, success rate, explosiveness, usage, recruiting rating, team talent, transfer history. CPOE and enriched rushing/passing begin in 2025 and cannot support this historical training window." },
  { source: "Licensed play charting / tracking", url: "https://media.pff.com/2018/08/PFF-Play-Data-Fields.pdf", metrics: "All-route separation, route win rate, release success, man/zone and press splits, route tree, first-read targets, coverage-adjusted YPRR, catchable targets, pressure-to-sack rate, clean/pressured pocket splits, time to throw, box counts, run concept, yards before contact, pass protection and blocking." },
  { source: "Verified historical records needed", url: "https://nflreadr.nflverse.com/articles/dictionary_combine.html", metrics: "Arm length, hand size, verified pro-day testing, injuries and missed-time reasons, archived consensus projections and projection disagreement. Future combine results are unavailable until measured." },
];
export type Measurements = Record<string, number | null>;
export function labValues(row: CollegeBoardRow, measurements: Measurements = {}): Measurements {
  const seasons = (row.college?.seasons ?? []).filter(s => s.year < row.draftYear).toSorted((a, b) => b.year - a.year);
  const s = seasons[0];
  const result: Measurements = { ...measurements, college: row.collegeScore, capital: row.draft?.score ?? null, schedule: row.model.seasons[0]?.scheduleStrength?.opponents ?? null, seasons: seasons.length || null };
  if (s) {
    const add = (a: number | null, b: number | null) => a === null || b === null ? null : a + b;
    const touches = add(s.carries, s.receptions), scrim = add(s.rushingYards, s.receivingYards);
    Object.assign(result, { games: s.games, recpg: ratio(s.receivingYards, s.games), catchpg: ratio(s.receptions, s.games), rushpg: ratio(s.rushingYards, s.games), touchpg: ratio(touches, s.games), scrimpg: ratio(scrim, s.games), recshare: ratio(s.receivingYards, s.teamPassingYards), rushshare: ratio(s.rushingYards, s.teamRushingYards), tdshare: ratio(s.receivingTD, s.teamPassingTD), ypc: ratio(s.rushingYards, s.carries), ypr: ratio(s.receivingYards, s.receptions), rectouch: ratio(s.receptions, touches), passpg: ratio(s.passingYards, s.games), comppct: ratio(s.completions, s.attempts), ypa: ratio(s.passingYards, s.attempts), tdrate: ratio(s.passingTD, s.attempts), intrate: ratio(s.interceptions, s.attempts), aypa: ratio(s.passingYards === null || s.passingTD === null || s.interceptions === null ? null : s.passingYards + 20 * s.passingTD - 45 * s.interceptions, s.attempts) });
    result.dominator = result.recshare === null || result.tdshare === null ? null : (result.recshare + result.tdshare) / 2;
    const pg = seasons.map(season => season.games !== null && season.games >= 3 ? ratio(row.position === "QB" ? season.passingYards : row.position === "RB" ? add(season.rushingYards, season.receivingYards) : season.receivingYards, season.games) : null);
    const observed = pg.filter((v): v is number => v !== null);
    result.peak = observed.length ? Math.max(...observed) : null;
    result.trend = pg[0] != null && pg[1] != null && seasons[0].year - seasons[1].year === 1 ? pg[0] - pg[1] : null;
  }
  for (const [key, value] of Object.entries(row.advanced?.metrics ?? {})) result[`advanced:${key}`] = value;
  return result;
}
export function displayMetric(value: number | null | undefined, unit: string) { return value == null ? "—" : unit === "%" ? `${(value * 100).toFixed(1)}%` : `${value.toFixed(unit === "s" ? 2 : 1)}${unit ? ` ${unit}` : ""}`; }
export function percentile(value: number | null | undefined, reference: number[], lower = false) {
  if (value == null || !reference.length) return null;
  const p = 100 * reference.reduce((sum, v) => sum + (v < value ? 1 : v === value ? .5 : 0), 0) / reference.length;
  return lower ? 100 - p : p;
}
