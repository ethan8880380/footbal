import Link from "next/link";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { AssetFlagMenu } from "@/components/asset-flag-menu";
import { EvidenceStrength } from "@/components/evidence-strength";
import { FilmRoom } from "@/components/player/film-room";
import { AgeCurve } from "@/components/player/age-curve";
import { EvidenceChip, evidenceAnchor, evidenceWindow, formatEvidenceValue } from "@/components/player/evidence-chip";
import { ExplainPanel } from "@/components/player/explain-panel";
import { ScoreTrack } from "@/components/player/score-track";
import { ValueHistoryChart } from "@/components/player/value-history-chart";
import { WeeklyChart } from "@/components/player/weekly-chart";
import { RecommendationBadge } from "@/components/recommendation-badge";
import { Tag } from "@/components/tag";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MonoLabel } from "@/components/viz/readout";
import { Widget } from "@/components/widget";
import { Button } from "@/components/ui/button";
import { allEvidence, type LeagueModel, type PlayerAnalysis } from "@/lib/analysis/league-model";
import { UNAVAILABLE_METRICS, WEEK_STATUS_LABELS, metricsForPosition } from "@/lib/domain/metrics";
import { AGE_CURVES, agePhase, type Reason } from "@/lib/domain/recommendations";
import { STRATEGIES, type Evidence, type ValueHistoryPoint } from "@/lib/domain/types";
import { formatAge, formatDate, formatDateTime, formatNumber, formatValue, signed } from "@/lib/format";
import { usageShare, weeklyShare } from "@/lib/view/roster-view";
import { cn } from "@/lib/utils";

interface PlayerReportProps {
  model: LeagueModel;
  player: PlayerAnalysis;
  history: ValueHistoryPoint[];
  aiEnabled: boolean;
}

export function PlayerReport({ model, player, history, aiEnabled }: PlayerReportProps) {
  const leagueId = model.dataset.league.leagueId;
  const evidence = allEvidence(player);
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const owner = player.ownerRosterId ? model.teamsById.get(player.ownerRosterId) : null;
  const isMine = owner?.rosterId === model.myTeam?.rosterId;
  const rec = player.recommendation;
  const share = usageShare(player);
  const shares = weeklyShare(player);
  const weekly = player.weeks
    .filter((w) => w.status !== "upcoming")
    .map((w, i) => ({ week: w.week, status: w.status, statusLabel: WEEK_STATUS_LABELS[w.status], points: w.points, share: shares[i] }));
  const slot = slotLabel(player.rosterSlot);
  const showExplain = aiEnabled && model.dataset.mode === "live";
  const inHeadline = (r: Reason) => rec.headline.includes(r.text.replace(/\.$/, ""));
  const headlineEvidence = [...rec.strengths, ...rec.concerns].filter(inHeadline).flatMap((r) => r.evidenceIds);

  return (
    <article className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-4">
        <div className="min-w-0 space-y-4">
          <Link href={`/leagues/${leagueId}/roster`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" />
            <MonoLabel className="text-current">{isMine ? "Roster" : owner?.name ?? "League"}</MonoLabel>
          </Link>
          <h1 className="font-dot text-4xl leading-none font-black tracking-tight sm:text-6xl">{player.name}</h1>
          {owner && model.myTeam ? <Button asChild variant="outline" size="sm"><Link href={`/leagues/${leagueId}/targets?${new URLSearchParams({ asset: `player:${player.playerId}` })}`}>{isMine ? "Shop this player" : "Find a package"}</Link></Button> : null}
          <div className="flex flex-wrap items-center gap-1.5">
            <a href="#film-room" className="inline-flex min-h-11 items-center rounded-full border border-input px-3 text-sm font-medium hover:bg-accent">Film room</a>
            <Tag>{player.position ?? "?"}</Tag>
            <Tag>{player.team ?? "FA"}</Tag>
            {player.age !== null ? <Tag>{formatAge(player.age)} yrs</Tag> : null}
            {slot ? <Tag>{slot}</Tag> : null}
            {!isMine && owner ? <Tag tone="muted">{owner.name}</Tag> : null}
            {player.player?.injuryStatus ? <Tag tone="negative">{player.player.injuryStatus}</Tag> : null}
          </div>
        </div>
        {isMine ? <AssetFlagMenu leagueId={leagueId} assetKey={`player:${player.playerId}`} flag={player.flag} label={player.name} variant="button" /> : null}
      </header>

      <section aria-labelledby="rec-heading" className="rounded-3xl bg-card p-5 sm:p-7">
        <h2 id="rec-heading" className="sr-only">
          Recommendation
        </h2>
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-center">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <RecommendationBadge recommendation={rec.recommendation} size="lg" />
              <EvidenceStrength strength={rec.evidenceStrength} />
            </div>
            <p className="text-lg leading-snug text-balance sm:text-xl">{rec.headline}</p>
            <EvidenceChips ids={headlineEvidence} byId={byId} />
            <MonoLabel className="block">
              {owner ? STRATEGIES[owner.strategy] : "Balanced"} roster{owner && owner.strategySource === "estimate" ? " · est." : ""}
            </MonoLabel>
          </div>
          {rec.score !== null ? (
            <div className="space-y-5">
              <div className="flex items-baseline justify-between">
                <MonoLabel>Score</MonoLabel>
                <span className="num font-dot text-4xl leading-none font-black">{signed(rec.score, 2)}</span>
              </div>
              <ScoreTrack score={rec.score} />
              {rec.components.length ? (
                <Collapsible>
                  <CollapsibleTrigger className="group inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                    <MonoLabel className="text-current">Breakdown</MonoLabel>
                    <ChevronDown className="size-3 transition-transform group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <table className="mt-3 w-full text-xs">
                      <tbody>
                        {rec.components.map((c) => (
                          <tr key={c.key} className="border-b border-foreground/[0.06] last:border-0">
                            <td className="py-2 pr-3 font-medium">{c.label}</td>
                            <td className="py-2 pr-3 text-muted-foreground">{c.note}</td>
                            <td className={cn("num py-2 text-right font-mono", c.points < 0 && "text-negative")}>{signed(c.points, 2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <Widget label="Strengths">
          <ReasonList reasons={rec.strengths.filter((r) => !inHeadline(r))} byId={byId} empty={rec.strengths.length ? "Covered above." : "None in the connected data."} />
        </Widget>
        <Widget label="Concerns">
          <ReasonList reasons={rec.concerns.filter((r) => !inHeadline(r))} byId={byId} empty={rec.concerns.length ? "Covered above." : "None in the connected data."} concern />
        </Widget>
        <Widget label="What flips it" id="triggers">
          {rec.changeTriggers.length ? (
            <ul className="space-y-2.5 text-sm leading-relaxed">
              {rec.changeTriggers.map((t) => (
                <li key={t} className="flex gap-2.5">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground/30" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Signals agree; nothing single flips it.</p>
          )}
        </Widget>
      </div>

      <Widget
        label="Production"
        id="production"
        action={
          <div className="flex flex-wrap justify-end gap-1.5">
            {player.season && player.season.gamesPlayed > 0 && player.season.gamesPlayed < 4 ? <Tag tone="muted">Small sample</Tag> : null}
            {player.unsupportedScoring.length ? (
              <Link href={`/leagues/${leagueId}/settings#sources`}>
                <Tag tone="negative">{player.unsupportedScoring.length} rules unmodeled</Tag>
              </Link>
            ) : null}
          </div>
        }
      >
        {player.season ? (
          <div className="space-y-6">
            {weekly.length ? <WeeklyChart data={weekly} shareLabel={share.label} /> : null}
            <ProductionTable player={player} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No NFL stats synced.</p>
        )}
      </Widget>

      <Widget label="Market" id="market">
        <MarketFit model={model} player={player} history={history} isMine={isMine} />
      </Widget>

      <div className="grid gap-4 md:grid-cols-2">
        <Widget label="Profile" id="profile">
          <ProfileFacts player={player} />
        </Widget>
        <Widget label="Context" id="context">
          {player.context.length ? (
            <dl>
              {player.context.map((e) => (
                <div key={e.id} className="border-b border-foreground/[0.06] py-2.5 last:border-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-sm text-muted-foreground">{e.label}</dt>
                    <dd className="text-right text-sm font-medium">{formatEvidenceValue(e)}</dd>
                  </div>
                  <MonoLabel className="mt-1 block">
                    {e.provider} · {formatDateTime(e.dataCutoff ?? e.retrievedAt)}
                    {e.dateRange ? ` · since ${formatDate(e.dateRange)}` : ""}
                  </MonoLabel>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">No dated context.</p>
          )}
        </Widget>
      </div>

      {showExplain ? (
        <Widget label="Explanation" id="ai">
          <ExplainPanel leagueId={leagueId} playerId={player.playerId} enabled labels={Object.fromEntries(evidence.map((e) => [e.id, e.label]))} />
        </Widget>
      ) : null}

      <Widget label={`Sources · ${evidence.length}`} id="sources">
        <div className="max-h-[26rem] overflow-y-auto rounded-2xl bg-foreground/[0.03] px-2">
          <SourcesTable evidence={evidence} />
        </div>
        <Missing player={player} />
        <MonoLabel className="mt-4 block leading-relaxed">
          {player.identity?.gsisId ? `GSIS ${player.identity.gsisId}` : "No GSIS ID"}
          {player.identity?.pfrId ? ` · PFR ${player.identity.pfrId}` : ""} · Sleeper {player.playerId}
          {player.identity ? ` · via ${player.identity.resolvedVia}` : ""}
        </MonoLabel>
      </Widget>
      <FilmRoom key={player.playerId} playerId={player.playerId} name={player.name} />
    </article>
  );
}

function ReasonList({ reasons, byId, empty, concern = false }: { reasons: Reason[]; byId: Map<string, Evidence>; empty: string; concern?: boolean }) {
  if (!reasons.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-4">
      {reasons.map((r) => (
        <li key={r.text} className="flex gap-2.5 text-sm leading-relaxed">
          <span className={cn("mt-2 size-1.5 shrink-0 rounded-full", concern ? "bg-negative" : "bg-foreground")} aria-hidden />
          <div className="min-w-0 space-y-2">
            <p>{r.text}</p>
            <EvidenceChips ids={r.evidenceIds} byId={byId} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EvidenceChips({ ids, byId }: { ids: string[]; byId: Map<string, Evidence> }) {
  const chips = [...new Set(ids)].map((id) => byId.get(id)).filter((e): e is Evidence => Boolean(e));
  if (!chips.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map((e) => (
        <EvidenceChip key={e.id} evidence={e} />
      ))}
    </span>
  );
}

function ProductionTable({ player }: { player: PlayerAnalysis }) {
  const metrics = metricsForPosition(player.position);
  const find = (list: Evidence[], key: string) => list.find((e) => e.metricKey === key) ?? null;
  const hasPrevious = player.metrics.previous.some((e) => e.value !== null && e.metricKey === "games_played" && Number(e.value) > 0);
  const recent = player.recent;
  return (
    <Table className="text-[13px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Metric</TableHead>
          <TableHead className="text-right">Season</TableHead>
          <TableHead className="text-right">{recent?.weekStart != null ? `Wk ${recent.weekStart}–${recent.weekEnd}` : "Recent"}</TableHead>
          {hasPrevious ? <TableHead className="hidden text-right sm:table-cell">Last yr</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {metrics.map((m) => (
          <TableRow key={m.key}>
            <TableCell title={`${m.definition}${m.denominator ? ` Per ${m.denominator.toLowerCase()}.` : ""}`}>{m.label}</TableCell>
            <ValueCell evidence={find(player.metrics.season, m.key)} />
            <ValueCell evidence={find(player.metrics.recent, m.key)} />
            {hasPrevious ? <ValueCell evidence={find(player.metrics.previous, m.key)} className="hidden sm:table-cell" /> : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ValueCell({ evidence, className }: { evidence: Evidence | null; className?: string }) {
  return (
    <TableCell className={cn("num text-right", className)}>
      {evidence && evidence.value !== null ? (evidence.units === "%" ? `${formatNumber(evidence.value)}%` : formatNumber(evidence.value)) : <span className="text-muted-foreground">—</span>}
    </TableCell>
  );
}

function ProfileFacts({ player }: { player: PlayerAnalysis }) {
  const phase = agePhase(player.position, player.age);
  const curve = player.position ? AGE_CURVES[player.position] : undefined;
  const draft = player.prospect.find((e) => e.metricKey === "nfl_draft");
  const combine = player.prospect.filter((e) => e.metricKey.startsWith("combine_"));
  return (
    <div className="space-y-6">
      {curve ? <AgeCurve age={player.age} curve={curve} /> : null}
      <dl>
        <Fact label="Age" value={player.age !== null ? `${formatAge(player.age)}${phase ? ` · ${phase === "rising" ? "pre-prime" : phase === "prime" ? "prime" : "post-prime"}` : ""}` : "Unknown"} />
        <Fact label="Draft" value={draft ? String(draft.value) : player.identity?.pfrId ? "Undrafted" : "Unknown"} />
        <Fact label="Experience" value={player.player?.yearsExp != null ? `${player.player.yearsExp} seasons` : "Unknown"} />
      </dl>
      {combine.length ? (
        <div className="space-y-1">
          <MonoLabel className="block">Combine</MonoLabel>
          <dl className="grid grid-cols-2 gap-x-6">
            {combine.map((e) => (
              <Fact key={e.id} label={e.label} value={formatEvidenceValue(e)} />
            ))}
          </dl>
        </div>
      ) : null}
      {player.imported.length ? (
        <div className="space-y-1">
          <MonoLabel className="block">Imported</MonoLabel>
          <dl>
            {player.imported.map((e) => (
              <Fact key={e.id} label={`${e.label} · ${e.provider}`} value={formatEvidenceValue(e)} />
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-foreground/[0.06] py-2 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium">{value}</dd>
    </div>
  );
}

function MarketFit({ model, player, history, isMine }: { model: LeagueModel; player: PlayerAnalysis; history: ValueHistoryPoint[]; isMine: boolean }) {
  const market = model.dataset.market;
  if (!market) return <p className="text-sm text-muted-foreground">No market values loaded.</p>;
  const value = player.market;
  const owner = player.ownerRosterId ? model.teamsById.get(player.ownerRosterId) : null;
  const samePosition = owner ? owner.roster.players.filter((id) => model.players.get(id)?.position === player.position && id !== player.playerId) : [];
  const points = history.filter((h) => h.value !== null).map((h) => ({ date: h.date, value: h.value }));
  const change = value?.change30d ?? null;
  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <MiniStat label="Value" value={formatValue(value?.value ?? null)} />
          <MiniStat label="30 days" value={signed(change)} negative={change !== null && change < 0} />
          <MiniStat label="Overall" value={value?.rank ? `#${value.rank}` : "—"} />
          <MiniStat label="Position" value={value?.positionRank ? `${player.position}${value.positionRank}` : "—"} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Tag tone={player.isOwnerStarter ? "solid" : "default"}>{player.isOwnerStarter ? "Starter" : `Depth · ${samePosition.length} other ${player.position}`}</Tag>
          {!isMine && owner ? <Tag tone="muted">{owner.name}</Tag> : null}
        </div>
        <div className="space-y-1">
          <MonoLabel className="block">
            {market.providerLabel} · {formatDate(market.valuedAt)}
          </MonoLabel>
          {market.approximations.map((a) => (
            <p key={a} className="text-xs text-muted-foreground">
              {a}
            </p>
          ))}
        </div>
      </div>
      {points.length >= 2 ? <ValueHistoryChart data={points} /> : <p className="self-center text-sm text-muted-foreground">History builds as values sync.</p>}
    </div>
  );
}

function MiniStat({ label, value, negative = false }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="space-y-2">
      <MonoLabel className="block">{label}</MonoLabel>
      <p className={cn("num font-dot text-3xl leading-none font-black", negative && "text-negative")}>{value}</p>
    </div>
  );
}

function SourcesTable({ evidence }: { evidence: Evidence[] }) {
  return (
    <Table className="text-xs">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Metric</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead className="hidden sm:table-cell">Window</TableHead>
          <TableHead>Source</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {evidence.map((e) => (
          <TableRow
            key={e.id}
            id={evidenceAnchor(e.id)}
            className="scroll-mt-32 target:bg-signal/10"
            title={[e.definition, e.sampleSize !== null ? `Sample: ${e.sampleSize} ${e.sampleUnit ?? ""}` : null, e.dataCutoff ? `Data through ${e.dataCutoff}` : null, e.kind].filter(Boolean).join(" · ")}
          >
            <TableCell>{e.label}</TableCell>
            <TableCell className="num text-right">{formatEvidenceValue(e)}</TableCell>
            <TableCell className="hidden text-muted-foreground sm:table-cell">{evidenceWindow(e) ?? "—"}</TableCell>
            <TableCell className="max-w-[12rem] truncate text-muted-foreground">
              {e.sourceUrl?.startsWith("http") ? (
                <a href={e.sourceUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-foreground hover:underline">
                  {e.provider}
                </a>
              ) : (
                e.provider
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Missing({ player }: { player: PlayerAnalysis }) {
  const unavailable = UNAVAILABLE_METRICS[player.position ?? ""] ?? [];
  const items = [...player.coverage.gaps, ...unavailable.map((u) => `${u.label}: ${u.reason}`), ...player.issues.map((i) => `ID mapping: ${i.detail}`)];
  if (!items.length) return null;
  return (
    <div className="mt-6 space-y-2">
      <MonoLabel className="block">Missing</MonoLabel>
      <ul className="space-y-1.5 text-xs text-muted-foreground">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full ring-1 ring-foreground/40" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function slotLabel(slot: PlayerAnalysis["rosterSlot"]) {
  return slot === "starter" ? "Starter" : slot === "reserve" ? "IR" : slot === "taxi" ? "Taxi" : slot === "bench" ? "Bench" : null;
}
