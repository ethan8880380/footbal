import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight, FlaskConical } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listLeagues } from "@/lib/db/repositories/league-repository";
import { getAppState } from "@/lib/db/repositories/settings-repository";
import { analyzeLeagueFormat } from "@/lib/domain/league-format";
import { relativeTime } from "@/lib/format";
import { sleeperClient } from "@/lib/providers/sleeper/sleeper-client";
import { getSeasonOptions } from "@/lib/services/sync-service";
import { ConnectLeagueForm } from "./connect-league-form";

interface ConnectFlowProps {
  searchParams: PageProps<"/">["searchParams"];
}

export async function ConnectFlow({ searchParams }: ConnectFlowProps) {
  await connection();
  const params = await searchParams;
  const username = typeof params.u === "string" ? params.u.trim() : "";
  const leagueId = typeof params.league === "string" ? params.league : null;

  const [connected, lastUsername, seasons] = await Promise.all([
    listLeagues(),
    getAppState<string>("lastUsername"),
    getSeasonOptions().catch(() => null),
  ]);
  const season = typeof params.season === "string" && /^\d{4}$/.test(params.season) ? params.season : seasons?.defaultLeagueSeason ?? String(new Date().getFullYear());

  return (
    <div className="mt-12 space-y-4">
      {connected.length > 0 ? (
        <section aria-labelledby="connected-heading" className="rounded-3xl bg-card p-2">
          <h2 id="connected-heading" className={LABEL}>
            Your leagues
          </h2>
          <ul>
            {connected.map((league) => (
              <li key={league.leagueId}>
                <Link href={`/leagues/${league.leagueId}`} className="group flex items-center justify-between gap-4 rounded-2xl px-4 py-3.5 transition-colors hover:bg-foreground/[0.05] focus-visible:bg-foreground/[0.06] focus-visible:outline-none">
                  <span className="truncate text-lg font-medium">{league.name}</span>
                  <span className="flex shrink-0 items-center gap-3 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                    <span>{league.season}</span><span className="hidden sm:inline">{relativeTime(league.retrievedAt)}</span>
                    <span className="grid size-8 place-items-center rounded-full bg-foreground/[0.06] transition-colors group-hover:bg-foreground group-hover:text-background">
                      <ArrowRight className="size-4" />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="connect-heading" className="rounded-3xl bg-card p-5 sm:p-6">
        <h2 id="connect-heading" className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
          Connect Sleeper
        </h2>
        <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" action="/">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="u">Username</Label>
            <Input className="h-9" id="u" name="u" defaultValue={username || lastUsername || ""} autoComplete="username" autoCapitalize="none" spellCheck={false} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="season">Season</Label>
            <select
              id="season"
              name="season"
              defaultValue={season}
              className="h-9 w-full rounded-full border border-input bg-input/30 px-3.5 text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:w-28"
            >
              {(seasons?.leagueSeasons ?? [season]).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="lg">
            Find leagues
          </Button>
        </form>
        {!seasons ? (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>Sleeper is unreachable</AlertTitle>
            <AlertDescription>The NFL state could not be loaded. Check your connection and try again.</AlertDescription>
          </Alert>
        ) : null}
        {username ? <LeagueResults username={username} season={season} selectedLeagueId={leagueId} /> : null}
      </section>

      <section className="flex items-center justify-between gap-4 rounded-3xl border border-dashed border-foreground/15 px-5 py-4">
        <span className="flex items-center gap-2.5 text-sm">
          <FlaskConical className="size-4 text-signal" />
          Demo league
        </span>
        <Button asChild variant="outline" size="sm">
          <Link href="/leagues/demo">Open demo</Link>
        </Button>
      </section>
    </div>
  );
}

async function LeagueResults({ username, season, selectedLeagueId }: { username: string; season: string; selectedLeagueId: string | null }) {
  let user;
  try {
    user = await sleeperClient.getUser(username);
  } catch {
    return <ErrorNote title="Could not reach Sleeper" body="Try again in a moment." />;
  }
  if (!user) return <ErrorNote title="No Sleeper user found" body={`Check the spelling of “${username}”.`} />;

  const leagues = await sleeperClient.getUserLeagues(user.user_id, season).catch(() => null);
  if (!leagues) return <ErrorNote title="Could not load leagues" body="Sleeper returned an error. Try again." />;
  if (leagues.length === 0) return <ErrorNote title={`No ${season} leagues`} body="Try another season." />;

  const sorted = [...leagues].sort((a, b) => Number(b.settings.type === 2) - Number(a.settings.type === 2) || a.name.localeCompare(b.name));
  return (
    <ul className="mt-5 space-y-1">
      {sorted.map((league) => {
        const format = analyzeLeagueFormat({
          settings: league.settings,
          scoringSettings: league.scoring_settings,
          rosterPositions: league.roster_positions,
          totalRosters: league.total_rosters ?? null,
        });
        const isSelected = league.league_id === selectedLeagueId;
        const query = new URLSearchParams({ u: username, season, league: league.league_id });
        return (
          <li key={league.league_id} className={isSelected ? "rounded-2xl bg-foreground/[0.05]" : undefined}>
            <Link href={`/?${query}`} scroll={false} className="flex flex-col gap-1 rounded-2xl px-4 py-3 hover:bg-foreground/[0.05] sm:flex-row sm:items-center sm:justify-between">
              <span className="font-medium">{league.name}</span>
              <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                {[
                  format.leagueType === "unknown" ? null : capitalize(format.leagueType),
                  `${format.teams} teams`,
                  format.isSuperflex ? "Superflex" : "1QB",
                  format.scoringLabel,
                  format.isIdp ? "IDP" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </Link>
            {isSelected ? <TeamPicker leagueId={league.league_id} userId={user.user_id} username={username} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

async function TeamPicker({ leagueId, userId, username }: { leagueId: string; userId: string; username: string }) {
  const [rosters, users] = await Promise.all([sleeperClient.getRosters(leagueId), sleeperClient.getLeagueUsers(leagueId)]).catch(() => [null, null]);
  if (!rosters || !users) return <div className="px-4 pb-4"><ErrorNote title="Could not load teams" body="Try again." /></div>;
  const userById = new Map(users.map((u) => [u.user_id, u]));
  const teams = rosters.map((r) => {
    const owner = r.owner_id ? userById.get(r.owner_id) : undefined;
    const teamName = typeof owner?.metadata?.team_name === "string" ? owner.metadata.team_name : null;
    return {
      rosterId: r.roster_id,
      label: teamName || owner?.display_name || `Unowned team ${r.roster_id}`,
      owner: owner?.display_name ?? null,
      isUnowned: !r.owner_id,
      isMine: r.owner_id === userId || r.co_owners.includes(userId),
      coOwner: r.co_owners.includes(userId),
    };
  });
  return (
    <div className="px-4 pb-4">
      <ConnectLeagueForm leagueId={leagueId} userId={userId} username={username} teams={teams} />
    </div>
  );
}

function ErrorNote({ title, body }: { title: string; body: string }) {
  return (
    <Alert className="mt-4">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{body}</AlertDescription>
    </Alert>
  );
}

const LABEL = "px-4 pt-3 pb-1 font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase";

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
