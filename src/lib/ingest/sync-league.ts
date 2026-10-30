import { saveLeagueImport } from "@/lib/db/repositories/league-repository";
import { SLEEPER_API, sleeperClient } from "@/lib/providers/sleeper/sleeper-client";
import { runStep } from "./freshness";

export async function syncLeague(leagueId: string, connectedUserId: string | null) {
  return runStep("league", leagueId, async () => {
    const [league, users, rosters, drafts, tradedPicks] = await Promise.all([
      sleeperClient.getLeague(leagueId),
      sleeperClient.getLeagueUsers(leagueId),
      sleeperClient.getRosters(leagueId),
      sleeperClient.getDrafts(leagueId),
      sleeperClient.getTradedPicks(leagueId),
    ]);

    await saveLeagueImport({
      league: {
        leagueId: league.league_id,
        name: league.name,
        season: league.season,
        status: league.status ?? null,
        totalRosters: league.total_rosters ?? rosters.length,
        settings: league.settings,
        scoringSettings: league.scoring_settings,
        rosterPositions: league.roster_positions,
        avatar: league.avatar ?? null,
        previousLeagueId: league.previous_league_id,
        draftId: league.draft_id,
        metadata: league.metadata ?? null,
      },
      members: users.map((u) => ({
        userId: u.user_id,
        displayName: u.display_name ?? null,
        teamName: typeof u.metadata?.team_name === "string" && u.metadata.team_name.trim() ? u.metadata.team_name.trim() : null,
        avatar: u.avatar ?? null,
        isCommissioner: Boolean(u.is_owner),
      })),
      rosters: rosters.map((r) => ({
        rosterId: r.roster_id,
        ownerId: r.owner_id,
        coOwners: r.co_owners,
        players: r.players,
        starters: r.starters,
        reserve: r.reserve,
        taxi: r.taxi,
        settings: r.settings,
      })),
      drafts: drafts.map((d) => ({
        draftId: d.draft_id,
        season: d.season,
        status: d.status,
        rounds: typeof d.settings.rounds === "number" ? d.settings.rounds : null,
        slotToRosterId: d.slot_to_roster_id,
      })),
      tradedPicks: tradedPicks.map((p) => ({
        season: p.season,
        round: p.round,
        originalRosterId: p.roster_id,
        ownerRosterId: p.owner_id,
        previousOwnerRosterId: p.previous_owner_id,
      })),
      connectedUserId,
    });
    return {
      rowCount: rosters.length,
      sourceUrl: `${SLEEPER_API}/league/${leagueId}`,
      message: `${rosters.length} rosters, ${drafts.length} drafts, ${tradedPicks.length} traded picks.`,
    };
  });
}
