"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { adviseLeagueAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AdvisorRequest, AdvisorResult } from "@/lib/ai/advisor";
import type { TradeProposal } from "@/lib/domain/trade/types";

interface Props {
  leagueId: string;
  counter?: boolean;
  proposal?: TradeProposal;
  onApply?: (proposal: TradeProposal) => void;
}

export function AdvisorPanel({ leagueId, counter = false, proposal, onApply }: Props) {
  const [mode, setMode] = useState<AdvisorRequest["mode"]>(counter ? "counter" : "team");
  const [goal, setGoal] = useState<AdvisorRequest["goal"]>("fit");
  const [position, setPosition] = useState<AdvisorRequest["position"]>("any");
  const [keepFirsts, setKeepFirsts] = useState(false);
  const [response, setResponse] = useState<{ key: string; result: AdvisorResult } | null>(null);
  const [pending, startTransition] = useTransition();
  const request = { mode, goal, position, keepFirsts, ...(counter ? { proposal } : {}) };
  const key = JSON.stringify([leagueId, request]);
  const result = response?.key === key ? response.result : null;
  const complete = !counter || Boolean(proposal?.sideA.gives.length && proposal.sideB.gives.length && proposal.sideA.rosterId !== proposal.sideB.rosterId);
  const run = () => startTransition(async () => {
    try { setResponse({ key, result: await adviseLeagueAction(leagueId, request) }); }
    catch { setResponse({ key, result: { cards: [], source: "rules", cached: false, message: "Connection interrupted. Try again." } }); }
  });

  return (
    <section className="space-y-4 rounded-3xl bg-card p-5 sm:p-6" aria-label={counter ? "Counteroffers" : "Advisor"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">{counter ? "Counteroffers" : "Next moves"}</h2>
        {!counter ? <div className="flex flex-wrap gap-1" role="group" aria-label="Advice type">
          {([["team", "Review team"], ["trades", "Find trades"], ["changes", "Review changes"]] as const).map(([value, label]) => <Button key={value} size="sm" variant={mode === value ? "secondary" : "ghost"} aria-pressed={mode === value} onClick={() => setMode(value)}>{label}</Button>)}
        </div> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {mode !== "changes" ? <>
          <Select value={goal} onValueChange={(v) => setGoal(v as AdvisorRequest["goal"])}>
            <SelectTrigger className="w-44" aria-label="Trade objective"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="fit">Fit my strategy</SelectItem><SelectItem value="lineup">Improve starters</SelectItem><SelectItem value="value">Gain market value</SelectItem></SelectContent>
          </Select>
          {!counter ? <Select value={position} onValueChange={(v) => setPosition(v as AdvisorRequest["position"])}>
            <SelectTrigger className="w-36" aria-label="Target position"><SelectValue /></SelectTrigger>
            <SelectContent>{(["any", "QB", "RB", "WR", "TE"] as const).map((p) => <SelectItem key={p} value={p}>{p === "any" ? "Team needs" : p}</SelectItem>)}</SelectContent>
          </Select> : null}
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={keepFirsts} onCheckedChange={(v) => setKeepFirsts(v === true)} />Keep my firsts</label>
        </> : null}
        <Button size="sm" onClick={run} disabled={pending || !complete}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {pending ? "Reviewing…" : counter ? "Suggest counteroffers" : "Get recommendations"}
        </Button>
      </div>
      <div aria-live="polite" aria-busy={pending} className="space-y-4">
        {result?.message ? <p className="text-sm text-muted-foreground">{result.message}</p> : null}
        {result?.cards.length ? <>
          <p className="font-mono text-[10px] uppercase text-muted-foreground">{result.source === "ai" ? "AI prioritized" : "Computed"}{result.cached ? " · cached" : ""}</p>
          <div className="grid gap-3 xl:grid-cols-3">
            {result.cards.map((card) => <article key={card.id} className="flex flex-col gap-3 rounded-2xl border border-foreground/10 p-4">
              <h3 className="text-sm font-medium">{card.title}</h3>
              {card.proposal ? <dl className="space-y-2 text-sm"><div><dt className="text-xs text-muted-foreground">Send</dt><dd>{card.sends.join(" + ")}</dd></div><div><dt className="text-xs text-muted-foreground">Receive</dt><dd>{card.receives.join(" + ")}</dd></div></dl> : null}
              <ul className="space-y-2 text-sm">{card.facts.map((fact) => <li key={fact.id}>{fact.href ? <Link href={fact.href} className="underline decoration-foreground/20 underline-offset-4 hover:decoration-foreground">{fact.text}</Link> : fact.text}</li>)}</ul>
              {card.risks.length ? <details className="text-sm" open><summary className="cursor-pointer text-muted-foreground">Risks ({card.risks.length})</summary><ul className="mt-2 space-y-1 text-muted-foreground">{card.risks.map((risk, i) => <li key={i}>{risk}</li>)}</ul></details> : null}
              <div className="mt-auto pt-2">{card.proposal && onApply ? <Button size="sm" variant="outline" onClick={() => onApply(card.proposal!)}>Use package</Button> : <Button asChild size="sm" variant="outline"><Link href={card.href}>{card.proposal ? "Open trade" : "Open report"}</Link></Button>}</div>
            </article>)}
          </div>
        </> : null}
      </div>
    </section>
  );
}
