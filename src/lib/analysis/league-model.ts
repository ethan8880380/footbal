import { analyzeLeagueFormat, type LeagueFormat } from "@/lib/domain/league-format";
import { solveLineup, type LineupResult } from "@/lib/domain/lineup";
import {
  buildMetricEvidence,
  buildWeekLog,
  summarizeWindow,
  type SeasonData,
  type WeekEntry,
  type WindowSummary,
} from "@/lib/domain/metrics";
import { buildPickInventory, valuePick, type PickAsset, type PickInventory } from "@/lib/domain/picks";
import { eligiblePositions, isIdpPosition, primaryPosition } from "@/lib/domain/positions";
import { recommend, type RecommendationResult } from "@/lib/domain/recommendations";
import { analyzeScoringSupport, unsupportedRulesFor, type ScoringSupport } from "@/lib/domain/scoring";
import { toNflverseTeam } from "@/lib/domain/teams";
import { estimateStrategies } from "@/lib/domain/trade/strategy";
import { positionNeeds, type PositionNeed } from "@/lib/domain/trade/targets";
import type { TradeContext, TradePlayer, TradeTeam } from "@/lib/domain/trade/types";
import type {
  AssetFlag,
  Evidence,
  IdentityRecord,
  MappingIssue,
  MarketValueRecord,
  PlayerRecord,
  RosterRecord,
  Strategy,
} from "@/lib/domain/types";
import { playerKey } from "@/lib/domain/valuation";
import type { LeagueDataset } from "./dataset";

export type RosterSlot = "starter" | "bench" | "reserve" | "taxi";

export interface PlayerAnalysis {
  playerId: string;
  name: string;
  player: PlayerRecord | null;
  position: string | null;
  positions: string[];
  team: string | null;
  age: number | null;
  ownerRosterId: string | null;
  rosterSlot: RosterSlot | null;
  identity: IdentityRecord | null;
  issues: MappingIssue[];
  market: MarketValueRecord | null;
  marketEvidence: Evidence | null;
  ageEvidence: Evidence | null;
  weeks: WeekEntry[];
  season: WindowSummary | null;
  recent: WindowSummary | null;
  previous: WindowSummary | null;
  metrics: { season: Evidence[]; recent: Evidence[]; previous: Evidence[] };
  context: Evidence[];
  prospect: Evidence[];
  imported: Evidence[];
  productionPercentile: number | null;
  productionPeers: number;
  recommendation: RecommendationResult;
  coverage: { available: number; total: number; gaps: string[] };
  isOwnerStarter: boolean;
  flag: AssetFlag | null;
  unsupportedScoring: string[];
}

export interface TeamSummary {
  rosterId: string;
  name: string;
  ownerName: string | null;
  ownerIds: string[];
  isUnowned: boolean;
  roster: RosterRecord;
  picks: PickAsset[];
  strategy: Strategy;
  strategySource: "manual" | "estimate" | "yours";
  strategyEvidence: string[];
  starterValue: number;
  totalValue: number;
  lineup: LineupResult | null;
}

export interface LeagueModel {
  dataset: LeagueDataset;
  format: LeagueFormat;
  scoring: ScoringSupport;
  teams: TeamSummary[];
  teamsById: Map<string, TeamSummary>;
  myTeam: TeamSummary | null;
  players: Map<string, PlayerAnalysis>;
  pickInventory: PickInventory;
  picksByKey: Map<string, PickAsset>;
  tradeContext: TradeContext;
  myNeeds: PositionNeed[];
  statsSeason: number | null;
}

const MIN_PERCENTILE_GAMES = 2;

export function buildLeagueModel(dataset: LeagueDataset, now = new Date()): LeagueModel {
  const { league, config, market } = dataset;
  const format = analyzeLeagueFormat(league);
  const scoring = analyzeScoringSupport(league.scoringSettings);
  const scoringInput = { settings: league.scoringSettings, support: scoring };

  const pickInventory = buildPickInventory({
    leagueSeason: league.season,
    rosterIds: dataset.rosters.map((r) => r.rosterId),
    drafts: dataset.drafts,
    tradedPicks: dataset.tradedPicks,
    defaultRounds: format.draftRounds,
    confirmedSeasons: config.confirmedPickSeasons,
    manualDraftSlots: config.manualDraftSlots,
  });
  const picksByKey = new Map(pickInventory.picks.map((p) => [p.key, p]));

  const ownerOf = new Map<string, { rosterId: string; slot: RosterSlot }>();
  for (const roster of dataset.rosters) {
    for (const id of roster.players) {
      const slot: RosterSlot = roster.reserve.includes(id) ? "reserve" : roster.taxi.includes(id) ? "taxi" : roster.starters.includes(id) ? "starter" : "bench";
      ownerOf.set(id, { rosterId: roster.rosterId, slot });
    }
  }

  const base = new Map<string, Omit<PlayerAnalysis, "productionPercentile" | "productionPeers" | "recommendation" | "isOwnerStarter">>();
  for (const [playerId, owner] of ownerOf) {
    base.set(playerId, analyzePlayerBase(playerId, owner, dataset, scoringInput, now));
  }

  const percentiles = productionPercentiles([...base.values()]);

  const memberById = new Map(dataset.members.map((m) => [m.userId, m]));
  const positionsById = new Map([...base.values()].map((p) => [p.playerId, { positions: p.positions, age: p.age }]));
  const pickValueByRoster = new Map<string, number>();
  if (market) {
    for (const pick of pickInventory.picks) {
      const value = valuePick(pick, market).value ?? 0;
      pickValueByRoster.set(pick.ownerRosterId, (pickValueByRoster.get(pick.ownerRosterId) ?? 0) + value);
    }
  }
  const estimates = estimateStrategies(
    dataset.rosters.map((r) => ({ rosterId: r.rosterId, playerIds: r.players, pickValue: pickValueByRoster.get(r.rosterId) ?? 0 })),
    { market, format, positions: positionsById },
  );

  const myRosterId = config.myRosterId && dataset.rosters.some((r) => r.rosterId === config.myRosterId) ? config.myRosterId : null;
  const teams: TeamSummary[] = dataset.rosters.map((roster) => {
    const owner = roster.ownerId ? memberById.get(roster.ownerId) : undefined;
    const coOwners = roster.coOwners.map((id) => memberById.get(id)?.displayName).filter(Boolean);
    const ownerName = owner?.displayName ?? null;
    const name = owner?.teamName ?? (ownerName ? `${ownerName}${coOwners.length ? ` + ${coOwners.length}` : ""}` : `Unowned team ${roster.rosterId}`);
    const estimate = estimates.get(roster.rosterId);
    const isMine = roster.rosterId === myRosterId;
    const manual = config.opponentStrategies[roster.rosterId];
    const lineup = market
      ? solveLineup(
          format.starterSlots,
          roster.players.map((id) => ({ playerId: id, positions: base.get(id)?.positions ?? [], score: market.values.get(id)?.value ?? null })),
        )
      : null;
    return {
      rosterId: roster.rosterId,
      name,
      ownerName,
      ownerIds: [roster.ownerId, ...roster.coOwners].filter((id): id is string => Boolean(id)),
      isUnowned: !roster.ownerId,
      roster,
      picks: pickInventory.picks.filter((p) => p.ownerRosterId === roster.rosterId),
      strategy: isMine ? config.strategy : manual ?? estimate?.strategy ?? "balanced",
      strategySource: isMine ? "yours" : manual ? "manual" : "estimate",
      strategyEvidence: estimate?.evidence ?? [],
      starterValue: lineup?.totalScore ?? 0,
      totalValue: roster.players.reduce((t, id) => t + (market?.values.get(id)?.value ?? 0), 0) + (pickValueByRoster.get(roster.rosterId) ?? 0),
      lineup,
    };
  });
  const teamsById = new Map(teams.map((t) => [t.rosterId, t]));

  const players = new Map<string, PlayerAnalysis>();
  for (const [playerId, info] of base) {
    const team = info.ownerRosterId ? teamsById.get(info.ownerRosterId) : undefined;
    const isOwnerStarter = Boolean(team?.lineup?.assignments.some((a) => a.playerId === playerId));
    const surplus = team && info.position ? positionSurplus(team, info.position, base) : 0;
    const pct = percentiles.get(playerId) ?? { percentile: null, peers: 0 };
    const ppgEvidence = info.metrics.season.find((e) => e.metricKey === "fantasy_ppg");
    const gamesEvidence = info.metrics.season.find((e) => e.metricKey === "games_played");
    const idpUnvalued = isIdpPosition(info.position) && info.market?.value == null;

    const recommendation = recommend({
      position: info.position,
      age: info.age,
      marketValue: idpUnvalued ? null : info.market?.value ?? null,
      marketChange30d: info.market?.change30d ?? null,
      productionPercentile: pct.percentile,
      productionPeers: pct.peers,
      gamesPlayed: info.season?.gamesPlayed ?? null,
      teamGames: info.season?.teamGames ?? null,
      isMyStarter: isOwnerStarter,
      isMine: info.ownerRosterId === myRosterId,
      positionSurplus: surplus,
      strategy: team?.strategy ?? "balanced",
      hasStatsIdentity: Boolean(info.identity?.gsisId),
      evidence: {
        market: info.marketEvidence?.id ?? null,
        ppg: ppgEvidence?.value != null ? ppgEvidence.id : null,
        games: gamesEvidence?.id ?? null,
        age: info.ageEvidence?.id ?? null,
      },
    });
    players.set(playerId, { ...info, productionPercentile: pct.percentile, productionPeers: pct.peers, recommendation, isOwnerStarter });
  }

  const tradeTeams = new Map<string, TradeTeam>(
    teams.map((t) => [
      t.rosterId,
      {
        rosterId: t.rosterId,
        name: t.name,
        playerIds: t.roster.players,
        reserve: t.roster.reserve,
        taxi: t.roster.taxi,
        isUnowned: t.isUnowned,
        strategy: t.strategy,
        strategySource: t.strategySource === "estimate" ? "estimate" : "manual",
        strategyEvidence: t.strategyEvidence,
      },
    ]),
  );
  const tradePlayers = new Map<string, TradePlayer>(
    [...players.values()].map((p) => [
      p.playerId,
      {
        playerId: p.playerId,
        name: p.name,
        position: p.position,
        positions: p.positions,
        age: p.age,
        evidenceStrength: p.recommendation.evidenceStrength,
        injuryStatus: p.player?.injuryStatus ?? null,
      },
    ]),
  );
  const tradeContext: TradeContext = {
    format,
    market,
    picksByKey,
    teams: tradeTeams,
    players: tradePlayers,
    exponent: config.consolidationExponent,
  };

  return {
    dataset,
    format,
    scoring,
    teams,
    teamsById,
    myTeam: myRosterId ? teamsById.get(myRosterId) ?? null : null,
    players,
    pickInventory,
    picksByKey,
    tradeContext,
    myNeeds: myRosterId ? positionNeeds(tradeContext, myRosterId) : [],
    statsSeason: dataset.seasonData?.season ?? null,
  };
}

function analyzePlayerBase(
  playerId: string,
  owner: { rosterId: string; slot: RosterSlot },
  dataset: LeagueDataset,
  scoringInput: { settings: Record<string, number>; support: ScoringSupport },
  now: Date,
) {
  const player = dataset.players.get(playerId) ?? null;
  const position = player ? primaryPosition(player.fantasyPositions, player.position) : null;
  const positions = player ? eligiblePositions(player.fantasyPositions, player.position) : [];
  const identity = dataset.identities.get(playerId) ?? null;
  const issues = dataset.mappingIssues.filter((i) => i.sleeperId === playerId);
  const market = dataset.market?.values.get(playerId) ?? null;
  const age = exactAge(player, now);

  const metricPlayer = { playerId, position, currentTeam: toNflverseTeam(player?.team ?? null), gsisId: identity?.gsisId ?? null, pfrId: identity?.pfrId ?? null };
  const seasonWeeks = dataset.seasonData ? buildWeekLog(metricPlayer, dataset.seasonData, scoringInput) : [];
  const season = dataset.seasonData ? summarizeWindow(seasonWeeks, "season") : null;
  const recent = dataset.seasonData ? summarizeWindow(seasonWeeks, "recent") : null;
  const previousWeeks = dataset.previousSeasonData ? buildWeekLog({ ...metricPlayer, currentTeam: null }, dataset.previousSeasonData, scoringInput) : [];
  const previous = dataset.previousSeasonData && previousWeeks.length ? summarizeWindow(previousWeeks, "season") : null;

  const metricEvidence = (data: SeasonData | null, window: WindowSummary | null, suffix: string) =>
    data && window
      ? buildMetricEvidence(playerId, position, data.season, window, data.retrievedAt).map((e) => ({ ...e, id: suffix ? `${e.id}:${suffix}` : e.id }))
      : [];

  const marketEvidence: Evidence | null = dataset.market
    ? {
        id: `${dataset.market.provider}:value:${playerId}`,
        playerId,
        metricKey: "market_value",
        label: "Market value",
        value: market?.value ?? null,
        units: `${dataset.market.providerLabel} value (0–10,000)`,
        provider: dataset.market.providerLabel,
        sourceUrl: market?.url ?? dataset.market.sourceUrl,
        season: null,
        weekStart: null,
        weekEnd: null,
        dateRange: null,
        sampleSize: null,
        sampleUnit: null,
        definition: "Provider market estimate from real trades. Not a performance projection or an acceptance probability.",
        denominator: null,
        dataCutoff: dataset.market.valuedAt,
        retrievedAt: dataset.market.retrievedAt,
        kind: dataset.market.provider === "csv" ? "manual" : "observed",
      }
    : null;

  const ageEvidence: Evidence | null =
    player && age !== null
      ? {
          id: `sleeper:age:${playerId}`,
          playerId,
          metricKey: "age",
          label: "Age",
          value: Math.round(age * 10) / 10,
          units: "years",
          provider: "Sleeper player directory",
          sourceUrl: "https://docs.sleeper.com/#players",
          season: null,
          weekStart: null,
          weekEnd: null,
          dateRange: null,
          sampleSize: null,
          sampleUnit: null,
          definition: player.birthDate ? "Calculated from birth date." : "Sleeper's whole-year age.",
          denominator: null,
          dataCutoff: player.retrievedAt,
          retrievedAt: player.retrievedAt,
          kind: player.birthDate ? "calculated" : "observed",
        }
      : null;

  const context = contextEvidence(playerId, player);
  const prospect = prospectEvidence(playerId, identity, dataset);
  const imported = dataset.importedEvidence.filter((e) => e.playerId === playerId);

  const gaps: string[] = [];
  const checks = [
    [Boolean(player), "Player is missing from the Sleeper directory."],
    [Boolean(identity?.gsisId), "No GSIS ID, so NFL stats cannot be joined."],
    [Boolean(season && season.gamesPlayed > 0), "No games played in the current stats window."],
    [Boolean(identity?.pfrId), "No PFR ID, so snap counts cannot be joined."],
    [market?.value != null, "No market value in this format."],
    [prospect.length > 0, "No draft or combine record."],
  ] as const;
  for (const [ok, gap] of checks) if (!ok) gaps.push(gap);

  return {
    playerId,
    name: player?.fullName ?? `Unknown player ${playerId}`,
    player,
    position,
    positions,
    team: player?.team ?? null,
    age,
    ownerRosterId: owner.rosterId,
    rosterSlot: owner.slot,
    identity,
    issues,
    market,
    marketEvidence,
    ageEvidence,
    weeks: seasonWeeks,
    season,
    recent,
    previous,
    metrics: {
      season: metricEvidence(dataset.seasonData, season, ""),
      recent: metricEvidence(dataset.seasonData, recent, ""),
      previous: metricEvidence(dataset.previousSeasonData, previous, "prev"),
    },
    context,
    prospect,
    imported,
    coverage: { available: checks.length - gaps.length, total: checks.length, gaps },
    flag: dataset.config.flags.get(playerKey(playerId)) ?? null,
    unsupportedScoring: unsupportedRulesFor(scoringInput.support, position).map((r) => r.key),
  };
}

function exactAge(player: PlayerRecord | null, now: Date) {
  if (!player) return null;
  if (player.birthDate) {
    const birth = new Date(player.birthDate);
    if (!Number.isNaN(birth.getTime())) return (now.getTime() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  }
  return player.age;
}

function productionPercentiles(players: { playerId: string; position: string | null; season: WindowSummary | null }[]) {
  const byPosition = new Map<string, { playerId: string; ppg: number }[]>();
  for (const p of players) {
    if (!p.position || !p.season || p.season.gamesPlayed < MIN_PERCENTILE_GAMES || p.season.pointsPerGame === null) continue;
    byPosition.set(p.position, [...(byPosition.get(p.position) ?? []), { playerId: p.playerId, ppg: p.season.pointsPerGame }]);
  }
  const result = new Map<string, { percentile: number | null; peers: number }>();
  for (const peers of byPosition.values()) {
    for (const p of peers) {
      const below = peers.filter((q) => q.ppg < p.ppg).length;
      result.set(p.playerId, { percentile: peers.length > 1 ? below / (peers.length - 1) : null, peers: peers.length });
    }
  }
  return result;
}

function positionSurplus(team: TeamSummary, position: string, base: Map<string, { position: string | null; market: MarketValueRecord | null }>) {
  const valued = team.roster.players.filter((id) => base.get(id)?.position === position && base.get(id)?.market?.value != null).length;
  const starting = team.lineup?.assignments.filter((a) => a.playerId && base.get(a.playerId)?.position === position).length ?? 0;
  return valued - starting;
}

function contextEvidence(playerId: string, player: PlayerRecord | null): Evidence[] {
  if (!player) return [];
  const newsDate = player.newsUpdated ? new Date(player.newsUpdated).toISOString() : null;
  const common = {
    playerId,
    provider: "Sleeper player directory",
    sourceUrl: "https://docs.sleeper.com/#players",
    season: null,
    weekStart: null,
    weekEnd: null,
    sampleSize: null,
    sampleUnit: null,
    denominator: null,
    retrievedAt: player.retrievedAt,
    kind: "observed" as const,
  };
  const items: Evidence[] = [];
  if (player.injuryStatus) {
    items.push({
      ...common,
      id: `sleeper:injury:${playerId}`,
      metricKey: "injury_status",
      label: "Injury status",
      value: [player.injuryStatus, player.injuryBodyPart].filter(Boolean).join(" · "),
      units: "status",
      dateRange: player.injuryStartDate,
      definition: "Sleeper injury designation as of the directory refresh.",
      dataCutoff: newsDate ?? player.retrievedAt,
    });
  }
  if (player.depthChartPosition && player.depthChartOrder != null) {
    items.push({
      ...common,
      id: `sleeper:depth:${playerId}`,
      metricKey: "depth_chart",
      label: "Depth chart",
      value: `${player.depthChartPosition} #${player.depthChartOrder}`,
      units: "slot",
      dateRange: null,
      definition: "Sleeper depth chart slot as of the directory refresh.",
      dataCutoff: player.retrievedAt,
    });
  }
  items.push({
    ...common,
    id: `sleeper:team:${playerId}`,
    metricKey: "nfl_team",
    label: "NFL team",
    value: player.team ?? "Free agent",
    units: "team",
    dateRange: null,
    definition: "Current NFL team in the Sleeper directory.",
    dataCutoff: player.retrievedAt,
  });
  return items;
}

function prospectEvidence(playerId: string, identity: IdentityRecord | null, dataset: LeagueDataset): Evidence[] {
  if (!identity?.pfrId) return [];
  const items: Evidence[] = [];
  const draft = dataset.prospects.draft.get(identity.pfrId);
  const common = {
    playerId,
    weekStart: null,
    weekEnd: null,
    dateRange: null,
    sampleSize: null,
    sampleUnit: null,
    denominator: null,
    dataCutoff: null,
    retrievedAt: null,
    kind: "observed" as const,
  };
  if (draft) {
    items.push({
      ...common,
      id: `nflverse:draft:${playerId}`,
      metricKey: "nfl_draft",
      label: "NFL draft",
      value: `${draft.season} round ${draft.round}, pick ${draft.pick}${draft.team ? ` (${draft.team})` : ""}`,
      units: "selection",
      provider: "nflverse draft picks",
      sourceUrl: "https://github.com/nflverse/nflverse-data/releases/tag/draft_picks",
      season: draft.season,
      definition: "Overall pick number and round in the NFL draft.",
    });
    items.push({
      ...common,
      id: `nflverse:draft_pick:${playerId}`,
      metricKey: "draft_overall",
      label: "Overall pick",
      value: draft.pick,
      units: "pick",
      provider: "nflverse draft picks",
      sourceUrl: "https://github.com/nflverse/nflverse-data/releases/tag/draft_picks",
      season: draft.season,
      definition: "Overall selection number; lower means more draft capital invested.",
    });
  }
  const combine = dataset.prospects.combine.get(identity.pfrId);
  if (combine) {
    const fields: [keyof typeof combine, string, string][] = [
      ["forty", "40-yard dash", "sec"],
      ["vertical", "Vertical jump", "in"],
      ["broadJump", "Broad jump", "in"],
      ["cone", "3-cone drill", "sec"],
      ["shuttle", "Short shuttle", "sec"],
      ["bench", "Bench press", "reps"],
      ["weight", "Weight", "lb"],
    ];
    for (const [field, label, units] of fields) {
      const value = combine[field];
      if (typeof value !== "number") continue;
      items.push({
        ...common,
        id: `nflverse:combine_${String(field)}:${playerId}`,
        metricKey: `combine_${String(field)}`,
        label,
        value,
        units,
        provider: "nflverse combine (NFL Combine only, not pro day)",
        sourceUrl: "https://github.com/nflverse/nflverse-data/releases/tag/combine",
        season: combine.season,
        definition: `${label} recorded at the NFL Scouting Combine. Pro-day results are not included.`,
      });
    }
  }
  return items;
}

export function allEvidence(player: PlayerAnalysis): Evidence[] {
  return [
    ...(player.marketEvidence ? [player.marketEvidence] : []),
    ...(player.ageEvidence ? [player.ageEvidence] : []),
    ...player.metrics.season,
    ...player.metrics.recent,
    ...player.metrics.previous,
    ...player.context,
    ...player.prospect,
    ...player.imported,
  ];
}
