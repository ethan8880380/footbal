"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { parseAsString, useQueryState } from "nuqs";
import { Loader2, Search, X } from "lucide-react";
import { findTradesAction } from "@/app/finder-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TradeEvaluationView } from "./trade-evaluation-view";
import type { CatalogAsset, CatalogTeam } from "@/lib/view/trade-view";
import type { TradeGoal } from "@/lib/domain/trade/advisor";
import { formatValue } from "@/lib/format";

type Result = Awaited<ReturnType<typeof findTradesAction>>;
export function TradeFinder({ leagueId, assets, teams, myRosterId }: { leagueId: string; assets: CatalogAsset[]; teams: CatalogTeam[]; myRosterId: string }) {
  const [assetKey, setAssetKey] = useQueryState("asset", parseAsString.withDefault(""));
  const [direction, setDirection] = useState("sell");
  const [query, setQuery] = useState("");
  const [goal, setGoal] = useState<TradeGoal>("fit");
  const [returns, setReturns] = useState<"any" | "players" | "picks">("any");
  const [keepFirsts, setKeepFirsts] = useState(false);
  const [pending, startTransition] = useTransition();
  const [response, setResponse] = useState<{ key: string; result: Result } | null>(null);
  const asset = assets.find((a) => a.key === assetKey);
  const selling = asset ? asset.rosterId === myRosterId : direction === "sell";
  const request = { leagueId, assetKey, goal, returns: selling ? returns : "any", keepFirsts };
  const key = JSON.stringify(request);
  const result = response?.key === key ? response.result : null;
  const filtered = assets.filter((a) => (direction === "sell" ? a.rosterId === myRosterId : a.rosterId !== myRosterId) &&
    `${a.label} ${a.position ?? ""}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  const run = () => startTransition(async () => {
    try { setResponse({ key, result: await findTradesAction(request) }); }
    catch { setResponse({ key, result: { trades: [], message: "Connection interrupted. Try again." } }); }
  });
  return <section className="space-y-5 rounded-3xl bg-card p-5 sm:p-6" aria-label="Trade finder">
    <h2 className="text-xl font-semibold">Trade finder</h2>
    {asset ? <div className="flex items-center justify-between rounded-2xl bg-foreground/5 p-4">
      <div><span className="mr-2 text-muted-foreground">{selling ? "Shop" : "Acquire"}</span><strong>{asset.label}</strong></div>
      <Button size="icon" variant="ghost" aria-label="Choose another asset" onClick={() => { void setAssetKey(""); setQuery(""); }}><X /></Button>
    </div> : <div className="space-y-3">
      <div className="flex gap-2"><Button variant={direction === "sell" ? "secondary" : "ghost"} onClick={() => setDirection("sell")}>Shop my assets</Button><Button variant={direction === "buy" ? "secondary" : "ghost"} onClick={() => setDirection("buy")}>Acquire an asset</Button></div>
      <Input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search players and picks" placeholder="Search players and picks" />
      <ul className="grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2" aria-label="Matching assets">
        {filtered.slice(0, 16).map((a) => <li key={a.key}><button className="flex w-full items-center gap-2 rounded-xl p-3 text-left text-sm hover:bg-foreground/5" onClick={() => { void setAssetKey(a.key); }}>
          <span className="min-w-0 flex-1"><span className="block truncate font-medium">{a.label}</span><span className="text-xs text-muted-foreground">{a.position} · {teams.find((t) => t.rosterId === a.rosterId)?.name}</span></span><span className="font-mono">{formatValue(a.value)}</span>
        </button></li>)}
      </ul>
      {!filtered.length ? <p className="text-sm text-muted-foreground">No matching assets.</p> : null}
    </div>}
    <div className="flex flex-wrap items-center gap-3">
      <Select value={goal} onValueChange={(v) => setGoal(v as TradeGoal)}><SelectTrigger className="w-44" aria-label="Finder objective"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fit">Fit my strategy</SelectItem><SelectItem value="lineup">Improve starters</SelectItem><SelectItem value="value">Gain adjusted value</SelectItem></SelectContent></Select>
      {selling ? <Select value={returns} onValueChange={(v) => setReturns(v as typeof returns)}><SelectTrigger className="w-40" aria-label="Return type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">Any return</SelectItem><SelectItem value="players">Players only</SelectItem><SelectItem value="picks">Picks only</SelectItem></SelectContent></Select> : null}
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={keepFirsts} onCheckedChange={(v) => setKeepFirsts(v === true)} />Keep my firsts</label>
      <Button onClick={run} disabled={pending || !asset}>{pending ? <Loader2 className="animate-spin" /> : <Search />}{pending ? "Searching…" : "Find packages"}</Button>
    </div>
    <div aria-live="polite" aria-busy={pending}>
      {result?.message ? <p className="text-sm text-muted-foreground">{result.message} <Link href={`/leagues/${leagueId}/settings#trade`} className="underline">Trade settings</Link></p> : null}
      {result?.trades.length ? <div className="grid gap-4 lg:grid-cols-2">{result.trades.map((trade) => <article key={trade.href} className="space-y-4 rounded-2xl border border-foreground/10 p-4">
        <h3 className="font-medium">{trade.partner}</h3>
        <dl className="grid grid-cols-2 gap-4 text-sm"><div><dt className="text-muted-foreground">Send</dt><dd className="mt-1 font-medium">{trade.sends.join(" + ")}</dd></div><div><dt className="text-muted-foreground">Receive</dt><dd className="mt-1 font-medium">{trade.receives.join(" + ")}</dd></div></dl>
        <div className="space-y-2 text-sm">{trade.evaluation.sides?.map((s) => <p key={s.rosterId}><strong>{s.rosterId === myRosterId ? "You" : "They"}: </strong>{s.timeline.note}{s.timeline.source === "estimate" ? " (Estimated strategy.)" : ""}</p>)}</div>
        {trade.evaluation.valueGap ? <p className="text-sm">{trade.evaluation.valueGap.label}</p> : null}
        <details><summary className="cursor-pointer text-sm">Evaluation & risks</summary><div className="pt-3"><TradeEvaluationView evaluation={trade.evaluation} names={trade.names} compact /></div></details>
        <Button asChild variant="outline" size="sm"><Link href={trade.href}>Open in lab</Link></Button>
      </article>)}</div> : null}
    </div>
  </section>;
}
