import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FlaskConical } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { listLeagues } from "@/lib/db/repositories/league-repository";
import { relativeTime } from "@/lib/format";
import { DEMO_LEAGUE_ID } from "@/lib/demo/demo-dataset";
import { getLeagueModel } from "@/lib/services/league-service";
import { HeaderControls } from "./header-controls";
import { LeagueNav } from "./league-nav";
import { LeagueSwitcher } from "./league-switcher";
import { StrategySelect } from "./strategy-select";
import { SyncButton } from "./sync-button";
import { TeamSelect } from "./team-select";

export async function LeagueHeader({ params }: { params: Promise<{ leagueId: string }> }) {
  await connection();
  const { leagueId } = await params;
  const [model, leagues] = await Promise.all([getLeagueModel(leagueId), listLeagues()]);
  if (!model) notFound();
  const isDemo = leagueId === DEMO_LEAGUE_ID;
  const leagueRun = model.dataset.sources.find((s) => s.id === "league");
  const staleSources = model.dataset.sources.filter((s) => s.state === "stale" || s.state === "error").length;

  return (
    <header className="relative z-30 bg-background/95 sm:sticky sm:top-0 backdrop-blur-md">
      {isDemo ? (
        <div className="flex items-center justify-center gap-2 bg-signal px-4 py-1.5 font-mono text-[10px] tracking-[0.16em] text-signal-foreground uppercase">
          <FlaskConical className="size-3.5" />
          Demo · synthetic data
        </div>
      ) : null}
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <Wordmark />
        <HeaderControls>
        <LeagueSwitcher
          current={{ leagueId, name: model.dataset.league.name, season: model.dataset.league.season }}
          leagues={leagues.map((l) => ({ leagueId: l.leagueId, name: l.name, season: l.season }))}
        />
        <TeamSelect
          leagueId={leagueId}
          value={model.myTeam?.rosterId ?? null}
          teams={model.teams.map((t) => ({ rosterId: t.rosterId, name: t.name }))}
        />
        <StrategySelect leagueId={leagueId} value={model.dataset.config.strategy} />
        <div className="flex items-center justify-end gap-2 sm:ml-auto">
          {isDemo ? null : <SyncButton leagueId={leagueId} syncedLabel={relativeTime(leagueRun?.retrievedAt ?? null)} issues={staleSources} />}
          <ThemeToggle />
        </div>
        </HeaderControls>
      </div>
      <LeagueNav leagueId={leagueId} />
    </header>
  );
}

export function LeagueHeaderSkeleton() {
  return (
    <header>
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <Wordmark />
        <Skeleton className="h-7 w-44 rounded-full" />
        <Skeleton className="h-7 w-36 rounded-full" />
      </div>
      <div className="mx-auto max-w-7xl px-4 pb-3">
        <Skeleton className="h-10 w-96 max-w-full rounded-full" />
      </div>
    </header>
  );
}

export function Wordmark() {
  return (
    <Link href="/" className="mr-2 font-dot text-xl leading-none font-black tracking-tight focus-visible:text-signal focus-visible:outline-none">
      Dynasty<span className="text-signal">.</span>Desk
    </Link>
  );
}
