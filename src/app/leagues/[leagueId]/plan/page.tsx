import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { CardsSkeleton, NoMarketNotice, NoTeamNotice, PageHeading } from "@/components/page-states";
import { Button } from "@/components/ui/button";
import { Widget } from "@/components/widget";
import { getLeagueModel } from "@/lib/services/league-service";
import { rosterPlan } from "@/lib/view/roster-plan";
import { formatValue } from "@/lib/format";

export const metadata: Metadata = { title: "Roster plan" };
export default function PlanPage({ params }: PageProps<"/leagues/[leagueId]/plan">) {
  return <Suspense fallback={<CardsSkeleton count={6} />}><Plan params={params} /></Suspense>;
}

async function Plan({ params }: Pick<PageProps<"/leagues/[leagueId]/plan">, "params">) {
  await connection();
  const { leagueId } = await params;
  const model = await getLeagueModel(leagueId);
  if (!model) notFound();
  const plan = rosterPlan(model);
  if (!plan) return <NoTeamNotice />;
  const base = `/leagues/${leagueId}`;
  const shop = (key: string) => `${base}/targets?${new URLSearchParams({ asset: key })}`;
  const colors = { rising: "bg-signal", prime: "bg-foreground/65", decline: "bg-orange-400", unknown: "bg-foreground/15" };
  const labels = { rising: "Pre-prime", prime: "Prime", decline: "Past prime", unknown: "Unknown" };
  const phases = ["rising", "prime", "decline", "unknown"] as const;
  return <div className="space-y-5">
    <PageHeading title="Roster plan" action={<Button asChild variant="outline"><Link href={`${base}/targets`}>Find a trade</Link></Button>} />
    {!model.dataset.market ? <NoMarketNotice leagueId={leagueId} /> : null}
    <div className="grid gap-4 sm:grid-cols-3">
      <Metric label="Active starter market value" value={model.dataset.market ? formatValue(plan.starterValue) : "—"} />
      <Metric label="Value in top three players" value={plan.topThreeShare === null ? "—" : `${Math.round(plan.topThreeShare * 100)}%`} />
      <Metric label="Players without values" value={String(plan.unvaluedPlayers)} />
    </div>
    <Widget label="Starter age exposure">
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">{phases.map((phase) => <span key={phase} className="flex items-center gap-2"><span className={`size-2 rounded-full ${colors[phase]}`} />{labels[phase]}</span>)}</div>
      <div className="mt-5 space-y-4">{plan.timeline.map((row) => <div key={row.years} className="grid grid-cols-[3rem_1fr_4rem] items-center gap-3">
        <span className="font-mono text-xs">{row.years ? `+${row.years} yr` : "Now"}</span>
        <div className="flex h-7 overflow-hidden rounded-lg bg-foreground/5" role="img" aria-label={`${row.years} years ahead: ${phases.map((p) => `${labels[p]} ${formatValue(row[p])}`).join(", ")} in current starter market value`}>
          {phases.map((phase) => <div key={phase} title={`${labels[phase]}: ${formatValue(row[phase])}`} className={colors[phase]} style={{ width: `${plan.starterValue > 0 ? row[phase] / plan.starterValue * 100 : 0}%` }} />)}
        </div>
        <span className="text-right font-mono text-sm" title="Share of current starter value past the position's age threshold">{row.declineShare === null ? "—" : `${Math.round(row.declineShare * 100)}%`}</span>
      </div>)}</div>
      <details className="mt-5 text-xs text-muted-foreground"><summary className="cursor-pointer">Age assumptions · {plan.ageCoverage}/{plan.starterCount} starters covered · % past prime</summary><p className="mt-2">The best active lineup and current market values stay fixed; only age advances. This is age exposure, not a points or value forecast. Position thresholds: QB 33, RB 27, WR 29, TE 30; DL/LB/DB 29. Reserve and taxi players are excluded from starting and replacement lineups.</p></details>
    </Widget>
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Widget label="Depth stress test">
        {plan.depth.length ? <ul className="divide-y divide-foreground/10">{plan.depth.slice(0, 5).map((row) => <li key={row.playerId} className="flex items-start justify-between gap-4 py-3 first:pt-0">
          <div><Link className="text-sm font-medium hover:underline" href={`${base}/players/${row.playerId}`}>Without {row.name}</Link><p className="mt-1 text-xs text-muted-foreground">{row.replacements.length ? `Next in: ${row.replacements.join(", ")}` : "No bench player enters"}{row.unfilled ? ` · ${row.unfilled} more empty slots` : ""}</p></div>
          <span className="shrink-0 font-mono text-sm">−{formatValue(row.loss)}</span>
        </li>)}</ul> : <p className="text-sm text-muted-foreground">Market values are needed to compare replacement lineups.</p>}
        <details className="mt-4 text-xs text-muted-foreground"><summary className="cursor-pointer">Market-value loss if one starter is unavailable</summary><p className="mt-2">Each scenario removes one starter and optimizes the remaining roster. Losses are independent and must not be added together. This does not forecast points or injury probability.</p></details>
      </Widget>
      <Widget label="Bench trade capital">
        {plan.surplus.length ? <ul className="divide-y divide-foreground/10">{plan.surplus.map((p) => <li key={p.playerId} className="flex items-center gap-3 py-3 first:pt-0"><Link href={`${base}/players/${p.playerId}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">{p.name}</Link><span className="font-mono text-xs">{formatValue(p.value)}</span><Button asChild size="sm" variant="outline"><Link href={shop(`player:${p.playerId}`)}>Shop</Link></Button></li>)}</ul> : <p className="text-sm text-muted-foreground">No valued, unprotected bench assets.</p>}
      </Widget>
      <Widget label="Starters near or past the age threshold">
        {plan.replacements.length ? <ul className="divide-y divide-foreground/10">{plan.replacements.map((p) => <li key={p.playerId} className="flex items-center justify-between gap-3 py-3 first:pt-0"><Link href={`${base}/players/${p.playerId}`} className="text-sm font-medium hover:underline">{p.name}</Link><span className="font-mono text-xs text-muted-foreground">{p.position} · {p.age.toFixed(1)} / {p.threshold}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No known starter ages within two years of their position threshold.</p>}
      </Widget>
      <Widget label="Draft capital">
        <div className="space-y-5">{plan.capital.map((year) => <section key={year.season} className="space-y-2">
          <div className="flex items-center justify-between"><h3 className="font-mono font-semibold">{year.season}</h3><span className="font-mono text-sm">{year.confirmed ? formatValue(year.value) : "Unconfirmed"}</span></div>
          {year.confirmed ? <>
            <p className="text-xs text-muted-foreground">{year.ownFirst ? year.ownFirstHeld ? "Your first: held" : `Your first: owned by ${year.ownFirst}` : "Your first: not in confirmed inventory"}</p>
            <div className="flex flex-wrap gap-2">{year.picks.map((pick) => <Link key={pick.key} href={shop(pick.key)} className="rounded-xl border border-foreground/15 px-3 py-2 text-sm hover:bg-foreground/5" title={`Shop ${pick.season} round ${pick.round}${pick.originalRosterId !== model.myTeam!.rosterId ? ` via ${model.teamsById.get(pick.originalRosterId)?.name}` : ""}`}>
              R{pick.round}{pick.slot !== null ? ` · ${pick.slot}` : ""}{pick.originalRosterId !== model.myTeam!.rosterId ? ` · ${model.teamsById.get(pick.originalRosterId)?.name}` : ""}
            </Link>)}</div>{!year.picks.length ? <p className="text-sm text-muted-foreground">No picks owned.</p> : null}
          </> : <Link href={`${base}/settings`} className="text-sm underline">Confirm draft season</Link>}
        </section>)}</div>
      </Widget>
    </div>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-3xl bg-card p-5"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-3 font-dot text-4xl font-black">{value}</p></div>;
}
