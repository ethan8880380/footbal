import { DotMeter } from "@/components/viz/dot-meter";
import { MonoLabel } from "@/components/viz/readout";
import { formatDate, formatValue, signed } from "@/lib/format";
import { cn } from "@/lib/utils";
import { STRATEGIES } from "@/lib/domain/types";
import type { SideEvaluation, TradeEvaluation } from "@/lib/domain/trade/evaluate";

interface TradeEvaluationViewProps {
  evaluation: TradeEvaluation;
  names: Record<string, string>;
  compact?: boolean;
}

const FIT = {
  good: { label: "Good fit", className: "border-foreground/40 text-foreground" },
  neutral: { label: "Neutral fit", className: "border-foreground/15 text-muted-foreground" },
  poor: { label: "Poor fit", className: "border-negative/40 text-negative" },
} as const;

/** Hook-free so it renders in both server and client trees. */
export function TradeEvaluationView({ evaluation, names, compact = false }: TradeEvaluationViewProps) {
  if (evaluation.issues.length) {
    return (
      <SignalList
        title="Invalid trade"
        items={evaluation.issues.map((issue) => `${issue.message}${issue.assetKey ? ` (${names[issue.assetKey] ?? issue.assetKey})` : ""}`)}
      />
    );
  }
  if (!evaluation.sides) {
    return <MissingInputs items={evaluation.missingInputs} />;
  }
  const [a, b] = evaluation.sides;

  return (
    <div className="space-y-4">
      {evaluation.isScorable ? null : <MissingInputs items={evaluation.missingInputs} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <SideAssets side={a} names={names} />
        <SideAssets side={b} names={names} />
      </div>

      {evaluation.valueGap ? (
        <div className="space-y-3 rounded-2xl bg-foreground/[0.04] p-4">
          <BalanceDots sides={[a, b]} />
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">{evaluation.valueGap.label}</span>
            <MonoLabel className="num">
              Gap {signed(evaluation.valueGap.adjusted)} adj · {signed(evaluation.valueGap.raw)} raw · {Math.round(evaluation.valueGap.share * 100)}%
            </MonoLabel>
          </div>
        </div>
      ) : null}

      {compact ? null : (
        <div className="grid gap-3 sm:grid-cols-2">
          <SideImpact side={a} names={names} />
          <SideImpact side={b} names={names} />
        </div>
      )}

      {evaluation.risks.length && !compact ? (
        <ul className="space-y-1.5 text-sm">
          {evaluation.risks.map((risk) => (
            <li key={risk} className="flex gap-2.5">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-negative" aria-hidden />
              {risk}
            </li>
          ))}
        </ul>
      ) : null}

      {evaluation.market && !compact ? (
        <MonoLabel className="block">
          {evaluation.market.provider} · {evaluation.market.format} · {formatDate(evaluation.market.valuedAt)}
        </MonoLabel>
      ) : null}
    </div>
  );
}

function SideAssets({ side, names }: { side: SideEvaluation; names: Record<string, string> }) {
  return (
    <div className="rounded-2xl bg-foreground/[0.04] p-4">
      <MonoLabel className="block truncate">{side.name} sends</MonoLabel>
      <ul className="mt-3 space-y-1.5 text-sm">
        {side.gives.assets.map((asset) => (
          <li key={asset.assetKey} className="flex items-baseline justify-between gap-2">
            <span className="truncate">{names[asset.assetKey] ?? asset.assetKey}</span>
            <span className={cn("num shrink-0 font-mono text-[11px]", asset.value === null ? "text-negative" : "text-muted-foreground")}>
              {asset.value === null ? "UNVALUED" : formatValue(asset.value)}
              {asset.pick?.range ? ` (${formatValue(asset.pick.range.late)}–${formatValue(asset.pick.range.early)})` : ""}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-baseline justify-between border-t border-foreground/[0.08] pt-3">
        <MonoLabel className="num">Raw {formatValue(side.gives.raw)}</MonoLabel>
        <span className="flex items-baseline gap-1.5">
          <MonoLabel>Adj</MonoLabel>
          <span className="num font-dot text-xl leading-none font-black">{formatValue(side.gives.adjusted)}</span>
        </span>
      </div>
    </div>
  );
}

function SideImpact({ side, names }: { side: SideEvaluation; names: Record<string, string> }) {
  const lineup = side.lineup;
  const fit = FIT[side.timeline.fit];
  return (
    <div className="space-y-3 rounded-2xl bg-foreground/[0.04] p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{side.name}</p>
        <span className={cn("inline-flex h-6 items-center rounded-full border px-2.5 font-mono text-[10px] tracking-[0.12em] uppercase", fit.className)}>
          {fit.label} · {STRATEGIES[side.timeline.strategy]}
          {side.timeline.source === "estimate" ? " (est.)" : ""}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{side.timeline.note}</p>
      {lineup ? (
        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5 text-xs">
          <dt>
            <MonoLabel>In</MonoLabel>
          </dt>
          <dd>{lineup.entering.length ? lineup.entering.map((id) => names[id] ?? id).join(", ") : "—"}</dd>
          <dt>
            <MonoLabel>Out</MonoLabel>
          </dt>
          <dd>{lineup.leaving.length ? lineup.leaving.map((id) => names[id] ?? id).join(", ") : "—"}</dd>
          <dt>
            <MonoLabel>Starters</MonoLabel>
          </dt>
          <dd className="num">
            {formatValue(lineup.starterValueBefore)} → <span className="font-medium">{formatValue(lineup.starterValueAfter)}</span>
          </dd>
          {side.depth.length ? (
            <>
              <dt>
                <MonoLabel>Depth</MonoLabel>
              </dt>
              <dd>{side.depth.map((d) => `${d.position} ${d.before}→${d.after}`).join(" · ")}</dd>
            </>
          ) : null}
          <dt>
            <MonoLabel>Roster</MonoLabel>
          </dt>
          <dd className={cn(side.capacity.requiredCuts && "text-negative")}>
            {side.capacity.activeAfter}/{side.capacity.limit}
            {side.capacity.requiredCuts ? ` · cut ${side.capacity.requiredCuts} (${side.capacity.cutCandidates.map((id) => names[id] ?? id).join(", ")})` : ""}
          </dd>
        </dl>
      ) : null}
    </div>
  );
}

const BALANCE_DOTS = 30;

/** One dot row per side's adjusted value; the larger side's excess is red. */
function BalanceDots({ sides }: { sides: SideEvaluation[] }) {
  const values = sides.map((s) => s.gives.adjusted ?? 0);
  const max = Math.max(...values);
  if (max <= 0) return null;
  const counts = values.map((v) => Math.round((v / max) * BALANCE_DOTS));
  const shared = Math.min(...counts);
  return (
    <dl className="space-y-1.5">
      {sides.map((side, i) => (
        <div key={side.rosterId} className="grid grid-cols-[minmax(0,7rem)_auto] items-center gap-3">
          <dt className="truncate">
            <MonoLabel>{side.name}</MonoLabel>
          </dt>
          <dd className="flex items-center">
            <DotMeter total={BALANCE_DOTS} lit={counts[i]} tail={counts[i] - shared} tailTone="negative" size="md" />
            <span className="sr-only">sends {formatValue(values[i])} adjusted</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MissingInputs({ items }: { items: string[] }) {
  if (!items.length) return null;
  return <SignalList title="Can't score yet" items={items} />;
}

function SignalList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl bg-negative/10 p-4 text-sm">
      <MonoLabel className="block text-negative">{title}</MonoLabel>
      <ul className="mt-2 space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-negative" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
