"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { parseAsArrayOf, parseAsString, useQueryStates } from "nuqs";
import { ChevronDown, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { evaluateTradeAction, saveTradeAction } from "@/app/actions";
import { CopyButton } from "@/components/copy-button";
import { TradeEvaluationView } from "@/components/trade/trade-evaluation-view";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatValue } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { CatalogAsset, CatalogTeam } from "@/lib/view/trade-view";
import { AdvisorPanel } from "@/components/league/advisor-panel";

type EvaluationResult = Awaited<ReturnType<typeof evaluateTradeAction>>;

interface TradeLabProps {
  leagueId: string;
  teams: CatalogTeam[];
  assets: CatalogAsset[];
  myRosterId: string | null;
}

export function TradeLab({ leagueId, teams, assets, myRosterId }: TradeLabProps) {
  const initialTeam = myRosterId ?? teams[0]?.rosterId ?? "";
  const [state, setState] = useQueryStates({
    a: parseAsString.withDefault(initialTeam),
    b: parseAsString.withDefault(teams.find((t) => t.rosterId !== initialTeam)?.rosterId ?? ""),
    ga: parseAsArrayOf(parseAsString).withDefault([]),
    gb: parseAsArrayOf(parseAsString).withDefault([]),
  });
  const [result, setResult] = useState<{ key: string; value: EvaluationResult } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");

  const isComplete = state.a !== state.b && state.ga.length > 0 && state.gb.length > 0;
  const proposalKey = JSON.stringify([state.a, state.b, state.ga, state.gb]);
  const shown = isComplete && result?.key === proposalKey ? result.value : null;
  useEffect(() => {
    if (!isComplete) return;
    let active = true;
    const timer = setTimeout(() => {
      startTransition(async () => {
        try {
          const value = await evaluateTradeAction(leagueId, { sideA: { rosterId: state.a, gives: state.ga }, sideB: { rosterId: state.b, gives: state.gb } });
          if (active) setResult({ key: proposalKey, value });
        } catch {
          if (active) { setResult({ key: proposalKey, value: null }); toast.error("Could not evaluate this trade. Try again."); }
        }
      });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalKey, leagueId]);

  const save = () =>
    startTransition(async () => {
      try {
      const response = await saveTradeAction(leagueId, name, { sideA: { rosterId: state.a, gives: state.ga }, sideB: { rosterId: state.b, gives: state.gb } });
      if (response.ok) {
        toast.success(response.message);
        setName("");
      } else toast.error(response.message);
      } catch { toast.error("Could not save this package. Try again."); }
    });

  return (
    <div className="space-y-6">
      {state.ga.length || state.gb.length ? <div className="flex justify-end"><Button variant="ghost" onClick={() => setState({ ga: [], gb: [] })}>Clear package</Button></div> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <SidePicker
          label="Side A"
          teams={teams}
          rosterId={state.a}
          otherRosterId={state.b}
          assets={assets}
          selected={state.ga}
          onTeamChange={(a) => setState({ a, ga: [] })}
          onSelectedChange={(ga) => setState({ ga })}
        />
        <SidePicker
          label="Side B"
          teams={teams}
          rosterId={state.b}
          otherRosterId={state.a}
          assets={assets}
          selected={state.gb}
          onTeamChange={(b) => setState({ b, gb: [] })}
          onSelectedChange={(gb) => setState({ gb })}
        />
      </div>



      <section aria-live="polite" aria-labelledby="evaluation-heading" className="rounded-3xl bg-card p-5 sm:p-6">
        <div className="mb-4 flex min-h-8 items-center justify-between gap-2">
          <h2 id="evaluation-heading" className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
            Evaluation
          </h2>
          {isPending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
        </div>
        {shown ? (
          <div className="space-y-4">
            <TradeEvaluationView evaluation={shown.evaluation} names={shown.names} />
            {shown.summary ? (
              <div className="flex flex-col gap-2 border-t border-foreground/[0.08] pt-4 sm:flex-row sm:items-center">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Package name" className="h-8 sm:max-w-xs" aria-label="Package name" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={save} disabled={isPending}>
                    Save package
                  </Button>
                  <CopyButton text={shown.summary} />
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-3 py-3 text-sm text-muted-foreground">
            <span className="flex gap-1" aria-hidden>
              <span className={cn("size-2 rounded-full", state.ga.length ? "bg-foreground" : "ring-1 ring-inset ring-foreground/30")} />
              <span className={cn("size-2 rounded-full", state.gb.length ? "bg-foreground" : "ring-1 ring-inset ring-foreground/30")} />
            </span>
            {isComplete ? result?.key === proposalKey ? "Could not evaluate this trade." : "Evaluating trade…" : "Pick assets on both sides."}
          </div>
        )}
      </section>
      {isComplete ? <details className="rounded-3xl bg-card p-4"><summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 font-medium">Explore counteroffers<ChevronDown className="size-4" /></summary><div className="pt-3">      <AdvisorPanel leagueId={leagueId} counter
        proposal={{ sideA: { rosterId: state.a, gives: state.ga }, sideB: { rosterId: state.b, gives: state.gb } }}
        onApply={(p) => { void setState({ a: p.sideA.rosterId, b: p.sideB.rosterId, ga: p.sideA.gives, gb: p.sideB.gives }); }} /></div></details> : null}
    </div>
  );
}

interface SidePickerProps {
  label: string;
  teams: CatalogTeam[];
  rosterId: string;
  otherRosterId: string;
  assets: CatalogAsset[];
  selected: string[];
  onTeamChange: (rosterId: string) => void;
  onSelectedChange: (keys: string[]) => void;
}

function SidePicker({ label, teams, rosterId, otherRosterId, assets, selected, onTeamChange, onSelectedChange }: SidePickerProps) {
  const [query, setQuery] = useState("");

  const own = useMemo(
    () =>
      assets
        .filter((a) => a.rosterId === rosterId)
        .sort((x, y) => Number(x.kind === "pick") - Number(y.kind === "pick") || (y.value ?? -1) - (x.value ?? -1)),
    [assets, rosterId],
  );
  const visible = own.filter((a) => !query || a.label.toLowerCase().includes(query.toLowerCase()));
  const byKey = new Map(own.map((a) => [a.key, a]));
  const toggle = (key: string, checked: boolean) => onSelectedChange(checked ? [...selected, key] : selected.filter((k) => k !== key));

  return (
    <section className="overflow-hidden rounded-3xl bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-3">
        <span className="flex items-center gap-2">
          <span className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">{label === "Side A" ? "Send" : "Receive"}</span>
        </span>
        <Select value={rosterId} onValueChange={(value) => { setQuery(""); onTeamChange(value); }}>
          <SelectTrigger size="sm" className="max-w-[16rem]" aria-label={`${label} team`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {teams.map((t) => (
              <SelectItem key={t.rosterId} value={t.rosterId} disabled={t.rosterId === otherRosterId}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selected.length ? (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {selected.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key, false)}
              className="inline-flex min-h-11 max-w-full items-center sm:min-h-8 gap-1.5 rounded-full bg-foreground px-3 text-xs text-background hover:bg-foreground/80"
              aria-label={`Remove ${byKey.get(key)?.label ?? key}`}
            >
              {byKey.get(key)?.label ?? key}
              <X className="size-3" />
            </button>
          ))}
        </div>
      ) : null}
      <details className="group/assets">
      <summary className="mx-4 mb-3 flex min-h-11 cursor-pointer items-center justify-between rounded-full border border-input px-4 text-sm font-medium"><span>Choose assets</span><ChevronDown className="size-4 shrink-0 transition-transform group-open/assets:rotate-180" /></summary>
      <div className="relative px-4 pb-3">
        <Search className="pointer-events-none absolute top-4 left-7 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter" className="h-8 pl-9" aria-label={`Filter ${label} assets`} />
      </div>
      <ul className="max-h-[min(24rem,50dvh)] overflow-y-auto overscroll-contain border-t border-foreground/[0.06] py-1">
        {visible.length === 0 ? <li className="px-4 py-6 text-sm text-muted-foreground">{query ? "No matching assets." : "No assets available."}</li> : null}
        {visible.map((asset) => {
          const checked = selected.includes(asset.key);
          return (
            <li key={asset.key}>
              <label className={cn("flex cursor-pointer items-center gap-3 px-4 py-1.5 text-sm hover:bg-foreground/[0.04]", checked && "bg-foreground/[0.06]")}>
                <Checkbox checked={checked} onCheckedChange={(value) => toggle(asset.key, value === true)} />
                <span className="w-9 shrink-0 font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">{asset.position ?? "?"}</span>
                <span className="min-w-0 flex-1 truncate">
                  {asset.label}
                  <span className="ml-2 hidden font-mono text-[10px] text-muted-foreground uppercase sm:inline">{asset.detail}</span>
                </span>
                <span className={cn("num shrink-0 font-mono text-[11px]", asset.value === null ? "text-negative" : "text-muted-foreground")}>{asset.value === null ? "—" : formatValue(asset.value)}</span>
              </label>
            </li>
          );
        })}
      </ul>
      </details>
    </section>
  );
}
