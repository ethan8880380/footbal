import { describe, expect, it } from "vitest";
import { playerTier, teamTier } from "./team-board";

describe("playerTier", () => {
  it("grades positional rank against league size", () => {
    expect(playerTier(3, 12)).toBe("elite");
    expect(playerTier(12, 12)).toBe("elite");
    expect(playerTier(18, 12)).toBe("solid");
    expect(playerTier(30, 12)).toBe("thin");
    expect(playerTier(62, 12)).toBe("weak");
    expect(playerTier(null, 12)).toBeNull();
  });
});

describe("teamTier", () => {
  it("splits a 12-team league into quarters and thirds", () => {
    expect(teamTier(1, 12)).toBe("elite");
    expect(teamTier(3, 12)).toBe("elite");
    expect(teamTier(5, 12)).toBe("solid");
    expect(teamTier(8, 12)).toBe("thin");
    expect(teamTier(11, 12)).toBe("weak");
  });
});
