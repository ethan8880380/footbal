import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ArrowUpRight, SlidersHorizontal } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { EvidenceStrength } from "@/components/evidence-strength";
import { CardsSkeleton, EmptyState, NoMarketNotice, NoTeamNotice, PageHeading } from "@/components/page-states";
import { RecommendationBadge } from "@/components/recommendation-badge";
import { Tag } from "@/components/tag";
import { TradeEvaluationView } from "@/components/trade/trade-evaluation-view";
import { Button } from "@/components/ui/button";
import { MonoLabel } from "@/components/viz/readout";
import { leagueTargets } from "@/lib/analysis/targets";
import type { LeagueModel } from "@/lib/analysis/league-model";
import type { PackageOption, TradeTarget } from "@/lib/domain/trade/targets";
import { formatAge, formatValue } from "@/lib/format";
import { getLeagueModel } from "@/lib/services/league-service";
import { cn } from "@/lib/utils";
import { evaluationNames, tradeCatalog } from "@/lib/view/trade-view";
import { TradeFinder } from "@/components/trade/trade-finder";

export const metadata: Metadata = { title: "Trade targets" };

export default function TargetsPage({ params }: PageProps<"/leagues/[leagueId]/targets">) {
  return (
    <Suspense fallback={<CardsSkeleton count={4} />}>
      <Targets params={params} />
    </Suspense>
  );
}

async function Targets({ params }: Pick<PageProps<"/leagues/[leagueId]/targets">, "params">) {
  await connection();
  const { leagueId } = await params;
  const model = await getLeagueModel(leagueId);
  if (!model) notFound();
  if (!model.myTeam) return <NoTeamNotice />;
  if (!model.dataset.market) return <NoMarketNotice leagueId={leagueId} />;

  const result = leagueTargets(model);
  const config = model.dataset.config;
  const catalog = tradeCatalog(model);
  const positions = config.targetPositions.length ? config.targetPositions : (result?.needs.filter((n) => n.deficit > 0).slice(0, 2).map((n) => n.position) ?? []);

  return (
    <div className="space-y-6">
      <PageHeading
        title="Targets"
        meta={
          <div className="flex flex-wrap gap-1.5">
            {positions.length ? positions.map((p) => <Tag key={p}>{p}</Tag>) : <Tag tone="muted">No positions</Tag>}
            {config.targetPositions.length ? null : <Tag tone="muted">From needs</Tag>}
            <Tag tone="muted">≤ {config.pickBudget.maxPicks} picks</Tag>
            <Tag tone="muted">{config.pickBudget.allowFirsts ? "1sts ok" : "No 1sts"}</Tag>
          </div>
        }
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={`/leagues/${leagueId}/settings#trade`}>
              <SlidersHorizontal />
              Adjust
            </Link>
          </Button>
        }
      />
      <TradeFinder key={JSON.stringify([config, [...config.flags], catalog])} leagueId={leagueId} assets={catalog.assets} teams={catalog.teams} myRosterId={model.myTeam.rosterId} />
      {result?.targets.length ? (
        <div className="space-y-4">
          {result.targets.map((target) => (
            <TargetCard key={target.playerId} target={target} model={model} leagueId={leagueId} />
          ))}
        </div>
      ) : (
        <EmptyState title="No targets">Mark more players available, widen positions, or raise the pick budget.</EmptyState>
      )}
    </div>
  );
}

function TargetCard({ target, model, leagueId }: { target: TradeTarget; model: LeagueModel; leagueId: string }) {
  const player = model.players.get(target.playerId);
  if (!player) return null;
  const rec = player.recommendation;
  const fit = target.fitReasons.slice(1);
  return (
    <article className="rounded-3xl bg-card p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link href={`/leagues/${leagueId}/players/${target.playerId}`} className="group inline-flex items-center gap-1.5 text-xl font-semibold tracking-tight">
            {player.name}
            <ArrowUpRight className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
          </Link>
          <MonoLabel className="block">
            {player.position} · {player.team ?? "FA"} · {formatAge(player.age)} · {target.ownerName}
          </MonoLabel>
        </div>
        <div className="text-right">
          <p className="num font-dot text-4xl leading-none font-black">{formatValue(target.value)}</p>
          {player.market?.positionRank ? <MonoLabel className="mt-2 block">{`${player.position}${player.market.positionRank}`}</MonoLabel> : null}
        </div>
      </header>

      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <Block title="Outlook">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <RecommendationBadge recommendation={rec.recommendation} />
            <EvidenceStrength strength={rec.evidenceStrength} />
          </div>
          <p>{rec.headline}</p>
        </Block>
        {fit.length ? (
          <Block title="Fit">
            <Bullets items={fit} />
          </Block>
        ) : null}
        <Block title="Why they'd sell">
          <Bullets items={target.whyTheyMightMove} />
        </Block>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <PackageBlock title="Opening" option={target.opening} model={model} leagueId={leagueId} fallback={target.noPackageReason} />
        <PackageBlock title="Alternative" option={target.alternative} model={model} leagueId={leagueId} fallback={target.opening ? "No distinct alternative." : null} />
      </div>

      {target.objections.length ? (
        <Block title="Risks" className="mt-6">
          <Bullets items={target.objections.slice(0, 6)} negative />
        </Block>
      ) : null}
    </article>
  );
}

function PackageBlock({ title, option, model, leagueId, fallback }: { title: string; option: PackageOption | null; model: LeagueModel; leagueId: string; fallback: string | null }) {
  if (!option) {
    return fallback ? (
      <div className="rounded-2xl border border-dashed border-foreground/15 p-4 text-sm text-muted-foreground">
        <MonoLabel className="block text-foreground">{title}</MonoLabel>
        <p className="mt-2">{fallback}</p>
      </div>
    ) : null;
  }
  const query = new URLSearchParams({
    a: option.proposal.sideA.rosterId,
    b: option.proposal.sideB.rosterId,
    ga: option.proposal.sideA.gives.join(","),
    gb: option.proposal.sideB.gives.join(","),
  });
  return (
    <div className="space-y-4 rounded-2xl bg-foreground/[0.03] p-4 ring-1 ring-foreground/[0.06]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonoLabel className="text-foreground">
          {title} · {option.shape}
        </MonoLabel>
        <div className="flex gap-1.5">
          <CopyButton text={option.summary} />
          <Button asChild size="sm" variant="ghost">
            <Link href={`/leagues/${leagueId}/trade-lab?${query}`}>Open in lab</Link>
          </Button>
        </div>
      </div>
      <TradeEvaluationView evaluation={option.evaluation} names={evaluationNames(option.evaluation, model)} compact />
    </div>
  );
}

function Block({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h3 className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">{title}</h3>
      <div className="mt-2.5 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function Bullets({ items, negative = false }: { items: string[]; negative?: boolean }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5">
          <span className={cn("mt-2 size-1.5 shrink-0 rounded-full", negative ? "bg-negative" : "bg-foreground/40")} aria-hidden />
          {item}
        </li>
      ))}
    </ul>
  );
}
