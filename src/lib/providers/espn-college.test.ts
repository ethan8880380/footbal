import { describe, expect, it } from "vitest";
import { fetchCollegePlayer, matchCollegeAthlete, type CollegeAthlete, type JsonLoader } from "./espn-college";
import { prospectSchema } from "../domain/prospects";
import { HttpError } from "../http/fetch-with-retry";

const prospect = prospectSchema.parse({ id: "jeremiah-smith-2027", name: "Jeremiah Smith", school: "Ohio State", position: "WR", draftYear: 2027, rank: 1, source: "Baseline", sourceUrl: "https://example.com", asOf: "2026-10-28" });
const athlete: CollegeAthlete = { id: "5079720", displayName: "Jeremiah Smith", school: "Ohio State", teamId: "194", position: { abbreviation: "WR" }, headshot: { href: "https://a.espncdn.com/i/headshots/college-football/players/full/5079720.png" } };
function payload(year: number, type = 2) {
  return { season: { $ref: `https://example.com/seasons/${year}` }, seasonType: { $ref: `https://example.com/seasons/${year}/types/${type}` }, splits: { categories: [
    { name: "general", stats: [{ name: "gamesPlayed", value: 7 }] },
    { name: "receiving", stats: [{ name: "receivingYards", value: 984 }, { name: "receptions", value: 52 }] },
    { name: "passing", stats: [{ name: "passingYards", value: 2262 }] },
  ] } };
}
const history = { categories: [{ name: "receiving", statistics: [{ teamId: "194", season: { year: 2026 } }, { teamId: "194", season: { year: 2025 } }] }] };
describe("ESPN identity and season parsing", () => {
  it("corrects positive game counts and postseason-contaminated core totals using a complete regular log", async () => {
    const load: JsonLoader = async url => {
      if (url.endsWith("/stats")) return { categories: [{ name: "receiving", statistics: [{ teamId: "194", season: { year: 2026 } }] }] };
      if (url.includes("/gamelog?")) return { names: ["receptions", "receivingYards"], filters: [{ name: "season", value: "2026" }], seasonTypes: [{ categories: [
        { splitType: "2", totals: ["52", "984"], events: [{ eventId: "a", stats: ["20", "300"] }, { eventId: "b", stats: ["20", "300"] }, { eventId: "b", stats: ["20", "300"] }] },
        { splitType: "3", events: [{ eventId: "c", stats: ["12", "384"] }] },
      ] }] };
      return payload(2026);
    };
    const result = await fetchCollegePlayer(prospect, athlete, 2026, load);
    expect(result.seasons[0]).toMatchObject({ games: 2, receptions: 40, receivingYards: 600, teamPassingYards: 2262 });
    expect(result.seasons[0].sourceUrl).toContain("gamelog?season=2026");
  });
  it("recovers a zero game count only from a matching complete regular-season log", async () => {
    const load = (logReceptions: string): JsonLoader => async url => {
      if (url.endsWith("/stats")) return { categories: [{ name: "receiving", statistics: [{ teamId: "194", season: { year: 2026 } }, { season: { year: 2020 } }] }] };
      if (url.includes("/gamelog?")) return { names: ["receptions"], filters: [{ name: "season", value: "2026" }], seasonTypes: [{ categories: [{ splitType: "2", events: [{ eventId: "a", stats: [logReceptions] }, { eventId: "b", stats: ["26"] }] }, { splitType: "3", events: [{ eventId: "c", stats: ["100"] }] }] }] };
      const original = payload(2026);
      original.splits.categories[0].stats[0].value = 0;
      // Legacy records identify season type through their canonical URL.
      return { ...original, seasonType: undefined, $ref: url };
    };
    const recovered = await fetchCollegePlayer(prospect, athlete, 2026, load("26"));
    expect(recovered.seasons[0].games).toBe(2);
    expect(recovered.seasons[0].gamesSourceUrl).toContain("gamelog?season=2026");
    const incomplete = await fetchCollegePlayer(prospect, athlete, 2026, load("25"));
    expect(incomplete.seasons[0].games).toBe(0);
    expect(incomplete.seasons[0].gamesSourceUrl).toBeUndefined();
  });
  it("requires unique identity matches; never assigns a headshot by surname", () => {
    expect(matchCollegeAthlete(prospect, [athlete])).toEqual(athlete);
    expect(matchCollegeAthlete(prospect, [{ ...athlete, displayName: "John Smith" }])).toBeNull();
    expect(matchCollegeAthlete({ ...prospect, school: "New School" }, [athlete, { ...athlete, id: "2", school: "Other School" }])).toBeNull();
  });
  it("keeps current production when a prior year is unavailable, and preserves missing values", async () => {
    const load: JsonLoader = async url => {
      if (url.endsWith("/stats")) return history;
      if (url.includes("/2025/")) throw new HttpError(url, 404, "Unavailable");
      return payload(2026);
    };
    const result = await fetchCollegePlayer(prospect, athlete, 2026, load);
    expect(result.seasons).toHaveLength(1);
    expect(result.seasons[0]).toMatchObject({ games: 7, receivingYards: 984, receivingTD: null, teamPassingYards: 2262 });
    expect(result.headshot).toBe(athlete.headshot!.href);
  });
  it("rejects a different season type rather than mixing playoff and regular totals", async () => {
    const load: JsonLoader = async url => url.endsWith("/stats") ? history : payload(2026, 3);
    await expect(fetchCollegePlayer(prospect, athlete, 2026, load)).rejects.toThrow("Player season mismatch");
  });
  it("does not use team totals when their season does not match", async () => {
    const load: JsonLoader = async url => {
      if (url.endsWith("/stats")) return { categories: [{ name: "receiving", statistics: history.categories[0].statistics.slice(0, 1) }] };
      return payload(url.includes("/teams/") ? 2025 : 2026);
    };
    const result = await fetchCollegePlayer(prospect, athlete, 2026, load);
    expect(result.seasons[0].teamPassingYards).toBeNull();
    expect(result.seasons[0].teamSourceUrl).toBeNull();
  });
});
