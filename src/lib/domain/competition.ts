export interface CollegeGame { id: string; year: number; home: string; away: string; homeScore: number; awayScore: number; neutral: boolean; }
export interface ScheduleStrength { rating: number; opponents: number; games: number; }

/** Ridge-regularized opponent-adjusted margin. Results are college points, not NFL probabilities. */
export function rateCollegeSchedules(games: CollegeGame[]): Record<string, ScheduleStrength> {
  const unique = [...new Map(games.map(g => [g.id, g])).values()];
  const schedules = new Map<string, { opponent: string; margin: number }[]>();
  for (const g of unique) {
    const margin = Math.max(-28, Math.min(28, g.homeScore - g.awayScore - (g.neutral ? 0 : 3)));
    schedules.set(g.home, [...(schedules.get(g.home) ?? []), { opponent: g.away, margin }]);
    schedules.set(g.away, [...(schedules.get(g.away) ?? []), { opponent: g.home, margin: -margin }]);
  }
  let ratings = new Map([...schedules.keys()].map(id => [id, 0]));
  for (let iteration = 0; iteration < 300; iteration++) {
    const next = new Map([...schedules].map(([id, schedule]) => [id, schedule.reduce((n, g) => n + g.margin + (ratings.get(g.opponent) ?? 0), 0) / (schedule.length + 4)]));
    const difference = Math.max(0, ...[...next].map(([id, value]) => Math.abs(value - ratings.get(id)!)));
    ratings = next;
    if (difference < .000001) break;
  }
  return Object.fromEntries([...schedules].map(([id, schedule]) => [id, { rating: ratings.get(id)!, opponents: schedule.reduce((n, g) => n + ratings.get(g.opponent)!, 0) / schedule.length, games: schedule.length }]));
}

export function competitionPoints(strength: ScheduleStrength | undefined, coefficient: number, reliability: number, reference = 0, cap = 15) {
  if (!strength || strength.games < 4) return 0;
  return Math.max(-cap, Math.min(cap, coefficient * (strength.opponents - reference) / 10)) * Math.sqrt(reliability);
}
