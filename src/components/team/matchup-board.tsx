import { cn } from "@/lib/utils";
import type { MatchupPlayer, MatchupSide, MatchupView } from "@/lib/view/matchup-view";
import { PlayerAvatar } from "./player-avatar";

const INJURY_LABELS: Record<string, string> = { Questionable: "Q", Doubtful: "D", Out: "O", Sus: "SUS" };

/** Two lineups face to face, slot by slot, with the bench underneath. */
export function MatchupBoard({ view }: { view: MatchupView }) {
  const { home, away, slots } = view;
  const rows = Math.max(home.starters.length, away?.starters.length ?? 0);
  const benchRows = Math.max(home.bench.length, away?.bench.length ?? 0);
  return (
    <div className="space-y-4">
      <Scoreboard home={home} away={away} />
      <section aria-label="Starters" className="space-y-1 rounded-3xl bg-card p-1.5">
        {Array.from({ length: rows }, (_, i) => (
          <MatchupRow key={i} slot={slots[i] ?? "—"} home={home.starters[i] ?? null} away={away?.starters[i] ?? null} />
        ))}
      </section>
      {benchRows ? (
        <section aria-label="Bench" className="space-y-1 rounded-3xl bg-card p-1.5">
          <h2 className="px-3 pt-2 pb-1 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">Bench</h2>
          {Array.from({ length: benchRows }, (_, i) => (
            <MatchupRow key={i} slot="BN" home={home.bench[i] ?? null} away={away?.bench[i] ?? null} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function Scoreboard({ home, away }: { home: MatchupSide; away: MatchupSide | null }) {
  const total = home.points + (away?.points ?? 0);
  const share = total > 0 ? (home.points / total) * 100 : 50;
  return (
    <div className="rounded-3xl bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <TeamScore side={home} leads={!away || home.points >= away.points} />
        <span className="mt-1 shrink-0 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">vs</span>
        {away ? <TeamScore side={away} leads={away.points >= home.points} mirrored /> : <p className="flex-1 text-right text-sm text-muted-foreground">Bye</p>}
      </div>
      {away ? (
        <div className="mt-4 flex h-1.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${Math.round(share)}% of points`}>
          <span className="h-full rounded-full bg-signal" style={{ width: `${share}%` }} />
          <span className="h-full flex-1 rounded-full bg-foreground/25" />
        </div>
      ) : null}
    </div>
  );
}

function TeamScore({ side, leads, mirrored }: { side: MatchupSide; leads: boolean; mirrored?: boolean }) {
  return (
    <div className={cn("min-w-0 flex-1", mirrored && "text-right")}>
      <p className={cn("flex items-center gap-2 text-sm font-medium", mirrored && "flex-row-reverse")}>
        {side.isMine ? <span className="size-1.5 shrink-0 rounded-full bg-signal" aria-label="Your team" /> : null}
        <span className="truncate">{side.name}</span>
      </p>
      <p className={cn("num font-dot text-3xl leading-tight font-black sm:text-5xl", !leads && "text-muted-foreground")}>{side.points.toFixed(2)}</p>
      <p className="font-mono text-[11px] tracking-[0.1em] text-muted-foreground">{side.record}</p>
    </div>
  );
}

function MatchupRow({ slot, home, away }: { slot: string; home: MatchupPlayer | null; away: MatchupPlayer | null }) {
  const homeWins = Boolean(home && away && home.points > away.points);
  const awayWins = Boolean(home && away && away.points > home.points);
  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <PlayerCell player={home} wins={homeWins} />
      <span className="w-9 shrink-0 text-center font-mono text-[10px] font-medium tracking-[0.06em] text-muted-foreground sm:w-11">{slot}</span>
      <PlayerCell player={away} wins={awayWins} mirrored />
    </div>
  );
}

function PlayerCell({ player, wins, mirrored }: { player: MatchupPlayer | null; wins: boolean; mirrored?: boolean }) {
  if (!player) return <div className="h-12 min-w-0 flex-1 rounded-[1.25rem] border border-dashed border-foreground/10" aria-label="Empty slot" />;
  const injury = player.injury ? INJURY_LABELS[player.injury] ?? null : null;
  return (
    <div className={cn("flex h-12 min-w-0 flex-1 items-center gap-2 rounded-[1.25rem] bg-foreground/[0.04] px-2 sm:gap-3 sm:px-3", mirrored && "flex-row-reverse text-right")}>
      <PlayerAvatar playerId={player.playerId} name={player.name} size={30} className="hidden sm:grid" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-tight">{player.name}</p>
        <p className="truncate font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
          {injury ? <span className="text-signal">{injury} </span> : null}
          {[player.position, player.team].filter(Boolean).join(" · ")}
        </p>
      </div>
      <span className={cn("num shrink-0 font-mono text-sm", wins ? "font-bold text-foreground" : "text-muted-foreground")}>{player.points.toFixed(2)}</span>
    </div>
  );
}
