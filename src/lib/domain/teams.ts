/** Sleeper team codes that differ from nflverse codes. */
const SLEEPER_TO_NFLVERSE: Record<string, string> = { LAR: "LA" };

export function toNflverseTeam(team: string | null): string | null {
  if (!team) return null;
  const upper = team.toUpperCase();
  return SLEEPER_TO_NFLVERSE[upper] ?? upper;
}
