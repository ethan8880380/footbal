import { describe, expect, it } from "vitest";
import { parseEventProps } from "./sportsgameodds-client";

function odd(statID: string, betTypeID: string, sideID: string, extra: Record<string, string> = {}) {
  return { statID, playerID: "CARSON_SCHWESINGER_1_NFL", betTypeID, sideID, ...extra };
}

const event = {
  eventID: "e1",
  status: { startsAt: "2026-11-01T17:00:00.000Z" },
  teams: { home: { teamID: "PITTSBURGH_STEELERS_NFL", names: { short: "PIT" } }, away: { teamID: "CLEVELAND_BROWNS_NFL", names: { short: "CLE" } } },
  players: { CARSON_SCHWESINGER_1_NFL: { playerID: "CARSON_SCHWESINGER_1_NFL", teamID: "CLEVELAND_BROWNS_NFL", name: "Carson Schwesinger", firstName: "Carson", lastName: "Schwesinger" } },
  odds: {
    "defense_combinedTackles-X-game-ou-over": odd("defense_combinedTackles", "ou", "over", { fairOdds: "-110", bookOdds: "+100", fairOverUnder: "9.5" }),
    "defense_combinedTackles-X-game-ou-under": odd("defense_combinedTackles", "ou", "under", { fairOdds: "+110", bookOdds: "+100", fairOverUnder: "9.5" }),
    "defense_interceptions-X-game-ou-over": odd("defense_interceptions", "ou", "over", { fairOdds: "+110", bookOdds: "+100", fairOverUnder: "0.5" }),
    "defense_interceptions-X-game-ou-under": odd("defense_interceptions", "ou", "under", { fairOdds: "-110" }),
    "defense_sacks-X-game-ou-over": odd("defense_sacks", "ou", "over", { fairOdds: "+300", bookOdds: "+290", fairOverUnder: "0.5" }),
    "defense_sacks-X-game-ou-under": odd("defense_sacks", "ou", "under", { fairOdds: "-300", bookOdds: "-400", fairOverUnder: "0.5" }),
  },
};

describe("parseEventProps", () => {
  it("keeps priced and yardage-style lines but drops placeholder prices on low-count markets", () => {
    const parsed = parseEventProps(event);
    expect(parsed).toMatchObject({ homeTeam: "PIT", awayTeam: "CLE" });
    const [player] = parsed.players;
    expect(player).toMatchObject({ names: ["Carson Schwesinger"], team: "CLE" });
    expect(player.lines.find((l) => l.market === "defense_combinedTackles")).toEqual({ market: "defense_combinedTackles", line: 9.5, overProbability: null });
    expect(player.lines.find((l) => l.market === "defense_interceptions")).toBeUndefined();
    expect(player.lines.find((l) => l.market === "defense_sacks")?.overProbability).toBeCloseTo(0.25, 2);
  });
});
