import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { AssetFlagMenu } from "@/components/asset-flag-menu";
import { PageHeading, TableSkeleton } from "@/components/page-states";
import { CsvImportForm } from "@/components/settings/csv-import-form";
import { RemoveLeagueButton } from "@/components/settings/remove-league-button";
import { SettingsForm } from "@/components/settings/settings-form";
import { SourceStatusList } from "@/components/source-status-list";
import { Widget } from "@/components/widget";
import { getMarketRun } from "@/lib/db/repositories/market-repository";
import { describeLineup } from "@/lib/domain/league-format";
import { SLOT_ELIGIBILITY } from "@/lib/domain/positions";
import { assetName } from "@/lib/domain/trade/evaluate";
import { CSV_TEMPLATES } from "@/lib/providers/csv-import";
import { mapLeagueToStatsGuy } from "@/lib/providers/market/stats-guy";
import { getLeagueModel } from "@/lib/services/league-service";
import { DEMO_LEAGUE_ID } from "@/lib/demo/demo-dataset";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage({ params }: PageProps<"/leagues/[leagueId]/settings">) {
  return (
    <Suspense fallback={<TableSkeleton rows={10} />}>
      <Settings params={params} />
    </Suspense>
  );
}

async function Settings({ params }: Pick<PageProps<"/leagues/[leagueId]/settings">, "params">) {
  await connection();
  const { leagueId } = await params;
  const model = await getLeagueModel(leagueId);
  if (!model) notFound();
  const { config, league } = model.dataset;
  const csvRun = await getMarketRun("csv", "csv");
  const mapping = mapLeagueToStatsGuy(model.format, league.scoringSettings);
  const positions = [...new Set(model.format.starterSlots.flatMap((slot) => SLOT_ELIGIBILITY[slot] ?? []))].filter((p) => p !== "K" && p !== "DEF");
  const nextDraftSeason = model.pickInventory.seasons.find((s) => s.status === "confirmed")?.season ?? null;
  const flagged = [...config.flags.entries()];
  const rosterIssues = model.dataset.mappingIssues;

  return (
    <div className="space-y-4">
      <PageHeading title="Settings" meta={league.name} action={leagueId !== DEMO_LEAGUE_ID ? <RemoveLeagueButton leagueId={leagueId} name={league.name} /> : undefined} />

      <SettingsForm
        leagueId={leagueId}
        positions={positions.length ? positions : ["QB", "RB", "WR", "TE"]}
        config={{
          strategy: config.strategy,
          targetPositions: config.targetPositions,
          maxPicks: config.pickBudget.maxPicks,
          allowFirsts: config.pickBudget.allowFirsts,
          consolidationExponent: config.consolidationExponent,
          draftOrderRules: config.draftOrderRules,
          confirmedPickSeasons: config.confirmedPickSeasons,
          manualDraftSlots: config.manualDraftSlots,
          opponentStrategies: config.opponentStrategies,
          marketProvider: config.marketProvider,
        }}
        pickSeasons={model.pickInventory.seasons}
        nextDraftSeason={nextDraftSeason}
        teams={model.teams.map((t) => ({ rosterId: t.rosterId, name: t.name, estimate: t.strategySource === "estimate" ? t.strategy : "balanced", evidence: t.strategyEvidence, isMine: t.rosterId === model.myTeam?.rosterId }))}
        hasCsvValues={Boolean(csvRun)}
      />

      <Widget id="flags" label="Protected and available">
        {flagged.length ? (
          <ul className="divide-y divide-foreground/[0.06]">
            {flagged.map(([key, flag]) => (
              <li key={key} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>{assetName(key, model.tradeContext)}</span>
                <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                  {flag === "protected" ? "Protected" : "Available"}
                  <AssetFlagMenu leagueId={leagueId} assetKey={key} flag={flag} label={assetName(key, model.tradeContext)} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            None yet. Flag players from the{" "}
            <Link href={`/leagues/${leagueId}/roster`} className="text-foreground underline underline-offset-4">
              roster
            </Link>
            .
          </p>
        )}
      </Widget>

      {leagueId !== DEMO_LEAGUE_ID ? (
        <Widget id="import" label="Import CSV">
          <div className="grid gap-4 md:grid-cols-2">
            <CsvImportForm leagueId={leagueId} kind="values" title="Market values" template={CSV_TEMPLATES.values} />
            <CsvImportForm leagueId={leagueId} kind="metrics" title="Metrics" template={CSV_TEMPLATES.metrics} />
          </div>
        </Widget>
      ) : null}

      <Widget id="sources" label="Diagnostics">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="mb-1 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Sources</h3>
            <SourceStatusList sources={model.dataset.sources} detailed />
          </div>
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">League format</h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Type</dt>
                <dd className="capitalize">{model.format.leagueType}</dd>
                <dt className="text-muted-foreground">Lineup</dt>
                <dd>{describeLineup(model.format)}</dd>
                <dt className="text-muted-foreground">Roster</dt>
                <dd>
                  {model.format.activeRosterLimit} active · {model.format.reserveSlots} IR · {model.format.taxiSlots} taxi
                </dd>
                <dt className="text-muted-foreground">Scoring</dt>
                <dd>{model.format.scoringLabel}</dd>
                <dt className="text-muted-foreground">Market mapping</dt>
                <dd className="font-mono text-xs">{model.dataset.market?.provider === "csv" ? "CSV import" : mapping.variantKey}</dd>
              </dl>
              {model.dataset.market?.approximations.length ? (
                <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                  {model.dataset.market.approximations.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div>
              <h3 className="mb-2 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Scoring rules</h3>
              <p className="text-sm">{model.scoring.supported.length} supported</p>
              {model.scoring.unsupported.length ? (
                <ul className="mt-1 space-y-0.5 text-xs">
                  {model.scoring.unsupported.map((rule) => (
                    <li key={rule.key} className="text-negative">
                      <span className="font-mono">{rule.key}</span> ({rule.points > 0 ? "+" : ""}
                      {rule.points}): {rule.reason}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Every nonzero rule is modeled.</p>
              )}
            </div>

            <div>
              <h3 className="mb-2 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Player ID mapping</h3>
              {rosterIssues.length ? (
                <ul className="space-y-0.5 text-xs">
                  {rosterIssues.map((issue) => (
                    <li key={`${issue.sleeperId}-${issue.kind}`}>
                      <span className="font-medium">{model.players.get(issue.sleeperId)?.name ?? issue.sleeperId}</span>: {issue.detail}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">All rostered players resolved by ID.</p>
              )}
            </div>

            {model.pickInventory.excluded.length ? (
              <div>
                <h3 className="mb-2 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Excluded picks</h3>
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {model.pickInventory.excluded.map((p, i) => (
                    <li key={i}>
                      {p.season} round {p.round ?? "?"} (roster {p.originalRosterId ?? "?"}): {p.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </Widget>
    </div>
  );
}
