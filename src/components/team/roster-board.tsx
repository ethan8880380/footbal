import Link from "next/link";
import { MonoLabel } from "@/components/viz/readout";
import { formatValue } from "@/lib/format";
import { cn } from "@/lib/utils";
import { playerTier, teamTier, type BoardPlayer, type PositionGroup, type TeamBoard } from "@/lib/view/team-board";
import type { PickRow } from "@/lib/view/roster-view";
import { PlayerAvatar } from "./player-avatar";
import { RankCell } from "./rank-cell";

/** Roster in position columns, Flock-style: positional rank as a heat cell, starters in full weight. */
export function RosterBoard({ leagueId, board }: { leagueId: string; board: TeamBoard }) {
  return (
    <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_14rem]">
      <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {board.groups.map((group) => (
          <PositionColumn key={group.position} leagueId={leagueId} group={group} teams={board.teams} />
        ))}
      </div>
      <PicksColumn picks={board.picks} />
    </div>
  );
}

function PositionColumn({ leagueId, group, teams }: { leagueId: string; group: PositionGroup; teams: number }) {
  return (
    <section aria-label={`${group.position} rank ${group.rank ?? "unranked"}`} className="rounded-3xl bg-card p-2">
      <ColumnHeader title={group.position}>
        <RankCell rank={group.rank} tier={teamTier(group.rank, teams)} prefix="#" />
      </ColumnHeader>
      {group.players.length ? (
        <ul>
          {group.players.map((player) => (
            <li key={player.playerId}>
              <PlayerRow leagueId={leagueId} player={player} teams={teams} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3 pb-3 text-sm text-muted-foreground">Empty</p>
      )}
    </section>
  );
}

function PlayerRow({ leagueId, player, teams }: { leagueId: string; player: BoardPlayer; teams: number }) {
  return (
    <Link
      href={`/leagues/${leagueId}/players/${player.playerId}`}
      title={`${player.name}${player.overallRank ? ` · #${player.overallRank} overall` : ""}${player.value !== null ? ` · ${formatValue(player.value)}` : ""}`}
      className="flex items-center gap-2.5 rounded-2xl px-2 py-1.5 transition-colors hover:bg-foreground/[0.05] focus-visible:bg-foreground/[0.07] focus-visible:outline-none"
    >
      <PlayerAvatar playerId={player.playerId} name={player.name} />
      <span className={cn("min-w-0 flex-1 truncate text-sm", player.isStarter ? "font-medium" : "text-muted-foreground")}>{player.name}</span>
      {player.injury ? <span className="font-mono text-[9px] text-negative">{injuryCode(player.injury)}</span> : null}
      {player.recommendation === "shop" ? (
        <span className="size-1.5 shrink-0 rounded-full bg-negative" title="Shop">
          <span className="sr-only">Shop</span>
        </span>
      ) : null}
      <RankCell rank={player.positionRank} tier={playerTier(player.positionRank, teams)} />
    </Link>
  );
}

const ROUND_STYLES: Record<number, string> = {
  1: "bg-foreground text-background",
  2: "bg-foreground/25 text-foreground",
};

/** One row per season; each pick is a disc showing its round, acquired picks ringed. */
function PicksColumn({ picks }: { picks: PickRow[] }) {
  const bySeason = new Map<string, PickRow[]>();
  for (const pick of picks) {
    const season = pick.label.split(" ")[0];
    bySeason.set(season, [...(bySeason.get(season) ?? []), pick]);
  }
  const seasons = [...bySeason.entries()];
  return (
    <section aria-label="Draft picks" className="rounded-3xl bg-card p-2">
      <ColumnHeader title="Picks">
        <MonoLabel>{picks.length}</MonoLabel>
      </ColumnHeader>
      {picks.length ? (
        <ul className="space-y-1.5">
          {seasons.map(([season, list]) => (
            <li key={season} className="space-y-2.5 rounded-2xl bg-foreground/[0.03] p-3">
              <div className="flex items-baseline justify-between">
                <span className="num font-mono text-xs">{season}</span>
                <span className="num font-mono text-[11px] text-muted-foreground">{formatValue(list.reduce((sum, p) => sum + (p.value ?? 0), 0))}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {list.map((pick) => {
                  const round = Number(pick.label.split(" ")[1]?.replace(/\D/g, "")) || 0;
                  return (
                    <span
                      key={pick.key}
                      title={`${pick.label}${pick.isOwn ? "" : ` · via ${pick.originalTeam}`} · ${formatValue(pick.value)}`}
                      className={cn(
                        "grid size-7 place-items-center rounded-full font-mono text-[10px]",
                        ROUND_STYLES[round] ?? "bg-foreground/[0.08] text-muted-foreground",
                        !pick.isOwn && "ring-1 ring-signal ring-offset-2 ring-offset-card",
                      )}
                    >
                      {round || "?"}
                      <span className="sr-only">{`${pick.label}${pick.isOwn ? "" : ` via ${pick.originalTeam}`}, value ${formatValue(pick.value)}`}</span>
                    </span>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3 pb-3 text-sm text-muted-foreground">None confirmed</p>
      )}
    </section>
  );
}

function ColumnHeader({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between px-3 pt-2 pb-2">
      <h3 className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">{title}</h3>
      {children}
    </header>
  );
}

function injuryCode(status: string) {
  const upper = status.toUpperCase();
  return upper === "IR" || upper === "PUP" || upper === "NA" ? upper : upper.slice(0, 1);
}
