/** Team codes used by Sleeper and sportsbooks that differ from nflverse codes. */
const TEAM_ALIASES: Record<string, string> = { LAR: "LA", WSH: "WAS", JAC: "JAX" };

export function toNflverseTeam(team: string | null): string | null {
  if (!team) return null;
  const upper = team.toUpperCase();
  return TEAM_ALIASES[upper] ?? upper;
}
