import { z } from "zod";
import { fetchJson, HttpError } from "@/lib/http/fetch-with-retry";
import type { CollegePlayer, CollegeSeason } from "@/lib/domain/college-model";
import type { Prospect } from "@/lib/domain/prospects";

const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football";
const CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football";
const COMMON = "https://site.web.api.espn.com/apis/common/v3/sports/football/college-football";
const statCategory = z.object({ name: z.string(), stats: z.array(z.object({ name: z.string(), value: z.number().optional() })) });
const seasonStats = z.object({ $ref: z.string().optional(), season: z.object({ $ref: z.string() }), seasonType: z.object({ $ref: z.string() }).optional(), splits: z.object({ categories: z.array(statCategory) }) });
function matchesSeason(stats: z.infer<typeof seasonStats>, year: number) {
  // Older ESPN records omit seasonType; their canonical statistic URL still identifies the season type.
  const ref = stats.seasonType?.$ref ?? stats.$ref ?? "";
  return new RegExp(`/seasons/${year}/types/2(?:[/?]|$)`).test(ref);
}
const rosterAthlete = z.object({ id: z.string(), displayName: z.string(), displayHeight: z.string().optional(), weight: z.number().optional(), headshot: z.object({ href: z.string() }).optional(), position: z.object({ abbreviation: z.string() }), experience: z.object({ years: z.number() }).optional() });
export type CollegeAthlete = z.infer<typeof rosterAthlete> & { school: string; teamId: string };
export type JsonLoader = (url: string) => Promise<unknown>;
export const espnJson: JsonLoader = url => fetchJson(url, { retries: 1, timeoutMs: 15000 });
export const normalizeCollegeName = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "").replace(/[^a-z0-9]/g, "");
const SCHOOL_ALIASES: Record<string, string> = { northcarolinastate: "ncstate", jaxstate: "jacksonvillestate", tenessee: "tennessee", umass: "massachusetts", olemiss: "olemiss" };
export const schoolKey = (name: string) => SCHOOL_ALIASES[normalizeCollegeName(name)] ?? normalizeCollegeName(name);

export async function fetchCollegeTeams(load: JsonLoader = espnJson) {
  const schema = z.object({ sports: z.array(z.object({ leagues: z.array(z.object({ teams: z.array(z.object({ team: z.object({ id: z.string(), location: z.string() }) })) })) })) });
  const data = schema.parse(await load(`${SITE}/teams?limit=1000`));
  return data.sports.flatMap(s => s.leagues.flatMap(l => l.teams.map(t => t.team)));
}
export async function fetchCollegeRoster(team: { id: string; location: string }, year: number, load: JsonLoader = espnJson): Promise<CollegeAthlete[]> {
  const data = z.object({ season: z.object({ year: z.number() }), athletes: z.array(z.object({ items: z.array(rosterAthlete) })) }).parse(await load(`${SITE}/teams/${team.id}/roster?season=${year}`));
  if (data.season.year !== year) throw new Error(`Roster season mismatch for ${team.location}`);
  return data.athletes.flatMap(g => g.items).filter(a => ["QB", "RB", "WR", "TE"].includes(a.position.abbreviation)).map(a => ({ ...a, teamId: team.id, school: team.location }));
}
export function matchCollegeAthlete(prospect: Prospect, athletes: CollegeAthlete[]): CollegeAthlete | null {
  const names = new Set([normalizeCollegeName(prospect.name), normalizeCollegeName(prospect.id.replace(/-\d{4}$/, ""))]);
  const matches = athletes.filter(a => a.position.abbreviation === prospect.position && names.has(normalizeCollegeName(a.displayName)));
  const schoolMatches = matches.filter(a => schoolKey(a.school) === schoolKey(prospect.school));
  if (schoolMatches.length === 1) return schoolMatches[0];
  // A unique full-name + position match allows a school transfer. Never guess by surname.
  return matches.length === 1 ? matches[0] : null;
}
export function statValue(categories: z.infer<typeof statCategory>[], category: string, name: string) {
  return categories.find(c => c.name === category)?.stats.find(s => s.name === name)?.value ?? null;
}

export async function fetchCollegePlayer(prospect: Prospect, athlete: CollegeAthlete, year: number, load: JsonLoader = espnJson): Promise<CollegePlayer> {
  const history = z.object({ categories: z.array(z.object({ name: z.string(), statistics: z.array(z.object({ teamId: z.string().optional(), season: z.object({ year: z.number() }) })) })) }).parse(await load(`${COMMON}/athletes/${athlete.id}/stats`));
  const seasons: CollegeSeason[] = [];
  for (let seasonYear = year; seasonYear >= year - 2; seasonYear--) {
    const teams = [...new Set(history.categories.filter(c => ["passing", "rushing", "receiving"].includes(c.name)).flatMap(c => c.statistics.filter(s => s.season.year === seasonYear).map(s => s.teamId).filter((id): id is string => !!id)))];
    if (teams.length !== 1) continue; // No statistics or ambiguous split season: do not mix team denominators.
    const teamId = teams[0];
    const sourceUrl = `${CORE}/seasons/${seasonYear}/types/2/athletes/${athlete.id}/statistics/0`;
    let payload: unknown;
    try { payload = await load(sourceUrl); }
    catch (error) { if (error instanceof HttpError && error.status === 404) continue; throw error; }
    const stats = seasonStats.parse(payload);
    if (!matchesSeason(stats, seasonYear)) throw new Error("Player season mismatch");
    const categories = stats.splits.categories;
    const verifiedLogValues = new Map<string, number>();
    let verifiedSourceUrl = sourceUrl;
    const get = (category: string, name: string) => verifiedLogValues.get(name) ?? statValue(categories, category, name);
    let games = get("general", "gamesPlayed");
    let gamesSourceUrl: string | undefined;
    const opportunityName = prospect.position === "QB" ? "passingAttempts" : prospect.position === "RB" ? "rushingAttempts" : "receptions";
    const opportunityCategory = prospect.position === "QB" ? "passing" : prospect.position === "RB" ? "rushing" : "receiving";
    const opportunities = get(opportunityCategory, opportunityName);
    if (opportunities !== null && opportunities > 0) {
      // Historical GP can be zero OR a misleading positive value. Cross-check all active seasons.
      const logUrl = `${COMMON}/athletes/${athlete.id}/gamelog?season=${seasonYear}`;
      try {
        const log = z.object({ names: z.array(z.string()), filters: z.array(z.object({ name: z.string(), value: z.string() })), seasonTypes: z.array(z.object({ categories: z.array(z.object({ splitType: z.string().optional(), totals: z.array(z.string()).optional(), events: z.array(z.object({ eventId: z.string(), stats: z.array(z.string()) })).optional() })) })) }).parse(await load(logUrl));
        const index = log.names.indexOf(opportunityName);
        const regular = log.seasonTypes.flatMap(t => t.categories.filter(c => c.splitType === "2"));
        const events = regular.flatMap(c => c.events ?? []);
        const unique = [...new Map(events.map(e => [e.eventId, e])).values()];
        const total = (i: number) => unique.reduce((n, e) => n + Number(e.stats[i]?.replaceAll(",", "")), 0);
        const logTotal = regular.length === 1 ? Number(regular[0].totals?.[index]?.replaceAll(",", "")) : NaN;
        const postseason = log.seasonTypes.flatMap(t => t.categories.filter(c => c.splitType === "3").flatMap(c => c.events ?? []));
        const allEvents = [...new Map([...unique, ...postseason].map(e => [e.eventId, e])).values()];
        const allTotal = allEvents.reduce((n, e) => n + Number(e.stats[index]?.replaceAll(",", "")), 0);
        // Some core "regular" records contain postseason totals (e.g. 2020). A log whose
        // per-game sums match its own regular-season summary can correct that contamination.
        if (log.filters.some(f => f.name === "season" && f.value === String(seasonYear)) && index >= 0 && unique.length && (total(index) === opportunities || (Number.isFinite(logTotal) && total(index) === logTotal) || (postseason.length > 0 && allTotal === opportunities))) {
          games = unique.length; gamesSourceUrl = logUrl;
          for (const name of ["receptions", "receivingYards", "receivingTouchdowns", "rushingAttempts", "rushingYards", "rushingTouchdowns", "passingAttempts", "completions", "passingYards", "passingTouchdowns", "interceptions"]) {
            const i = log.names.indexOf(name);
            if (i >= 0 && Number.isFinite(total(i))) verifiedLogValues.set(name, total(i));
          }
          verifiedSourceUrl = logUrl;
        }
      } catch { /* Incomplete logs must not invent a game denominator. */ }
    }
    const teamSourceUrl = `${CORE}/seasons/${seasonYear}/types/2/teams/${teamId}/statistics/0`;
    let teamCategories: z.infer<typeof statCategory>[] = [];
    let validTeamSource: string | null = null;
    try {
      const teamStats = seasonStats.parse(await load(teamSourceUrl));
      if (matchesSeason(teamStats, seasonYear)) { teamCategories = teamStats.splits.categories; validTeamSource = teamSourceUrl; }
    } catch { /* Missing team totals lower coverage; individual stats remain usable. */ }
    const team = (category: string, name: string) => statValue(teamCategories, category, name);
    seasons.push({ year: seasonYear, teamId, school: teamId === athlete.teamId ? athlete.school : `Team ${teamId}`,
      games, ...(gamesSourceUrl ? { gamesSourceUrl } : {}), receptions: get("receiving", "receptions"), receivingYards: get("receiving", "receivingYards"), receivingTD: get("receiving", "receivingTouchdowns"),
      carries: get("rushing", "rushingAttempts"), rushingYards: get("rushing", "rushingYards"), rushingTD: get("rushing", "rushingTouchdowns"),
      attempts: get("passing", "passingAttempts"), completions: get("passing", "completions"), passingYards: get("passing", "passingYards"), passingTD: get("passing", "passingTouchdowns"), interceptions: get("passing", "interceptions"),
      teamPassingYards: team("passing", "passingYards"), teamRushingYards: team("rushing", "rushingYards"), teamPassingTD: team("passing", "passingTouchdowns"), sourceUrl: verifiedSourceUrl, teamSourceUrl: validTeamSource,
    });
  }
  const headshot = athlete.headshot?.href;
  return { prospectId: prospect.id, athleteId: athlete.id, name: athlete.displayName, school: athlete.school, position: prospect.position,
    headshot: headshot && /^https:\/\/a\.espncdn\.com\/i\/headshots\//.test(headshot) ? headshot : null,
    height: athlete.displayHeight ?? "", weight: athlete.weight ?? null, seasons,
    fetchedAt: new Date().toISOString(), sourceUrl: `https://www.espn.com/college-football/player/stats/_/id/${athlete.id}`,
  };
}
