import { MonoLabel } from "@/components/viz/readout";
import { formatValue } from "@/lib/format";
import { cn } from "@/lib/utils";
import { teamTier, type PositionGroup } from "@/lib/view/team-board";
import { TIER_STYLES } from "./rank-cell";

interface TeamHeaderProps {
  name: string;
  meta: string;
  stats: { label: string; value: React.ReactNode; negative?: boolean }[];
  groups: PositionGroup[];
  teams: number;
}

/** Flock-style team strip: name, one line of stats, and a position bar sized by value and shaded by league rank. */
export function TeamHeader({ name, meta, stats, groups, teams }: TeamHeaderProps) {
  const valued = groups.filter((g) => g.total > 0);
  return (
    <section className="space-y-5 rounded-3xl bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 space-y-2.5">
          <h1 className="font-dot text-4xl leading-none font-black tracking-tight sm:text-5xl">{name}</h1>
          <MonoLabel className="block">{meta}</MonoLabel>
        </div>
        <dl className="flex flex-wrap gap-x-7 gap-y-3">
          {stats.map((stat) => (
            <div key={stat.label} className="space-y-1.5">
              <dt>
                <MonoLabel>{stat.label}</MonoLabel>
              </dt>
              <dd className={cn("num font-dot text-2xl leading-none font-black", stat.negative && "text-negative")}>{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {valued.length ? (
        <div className="flex gap-1" role="list" aria-label="Position group value and league rank">
          {valued.map((g) => {
            const tier = teamTier(g.rank, teams);
            return (
              <div
                key={g.position}
                role="listitem"
                className={cn("flex h-8 min-w-14 basis-0 items-center justify-between gap-2 rounded-full px-3 font-mono text-[11px]", tier ? TIER_STYLES[tier] : "bg-foreground/[0.08]")}
                style={{ flexGrow: g.total }}
                title={`${g.position}: ${formatValue(g.total)} total value, rank ${g.rank ?? "—"} of ${teams}`}
              >
                <span className="tracking-wider">{g.position}</span>
                <span className="num">#{g.rank ?? "—"}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
