import { Suspense } from "react";
import { LeagueHeader, LeagueHeaderSkeleton } from "@/components/league/league-header";
import { STATS_GUY } from "@/lib/providers/market/stats-guy";

export default function LeagueLayout({ children, params }: LayoutProps<"/leagues/[leagueId]">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Suspense fallback={<LeagueHeaderSkeleton />}>
        <LeagueHeader params={params} />
      </Suspense>
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-10">{children}</main>
      <footer className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-6 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        <span>
          Values{" "}
          <a href={STATS_GUY.attribution.url} target="_blank" rel="noreferrer" className="text-foreground underline-offset-4 hover:underline">
            {STATS_GUY.attribution.label}
          </a>{" "}
          · Stats nflverse · League Sleeper
        </span>
        <span>Market estimates, not projections or acceptance odds</span>
      </footer>
    </div>
  );
}
