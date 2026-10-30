"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { saveSettingsAction, type ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { STRATEGIES, type Strategy } from "@/lib/domain/types";

interface SettingsFormProps {
  leagueId: string;
  positions: string[];
  config: {
    strategy: Strategy;
    targetPositions: string[];
    maxPicks: number;
    allowFirsts: boolean;
    consolidationExponent: number;
    draftOrderRules: string | null;
    confirmedPickSeasons: string[];
    manualDraftSlots: Record<string, number>;
    opponentStrategies: Record<string, Strategy>;
    marketProvider: "statsguy" | "csv";
  };
  pickSeasons: { season: string; status: string; reason: string }[];
  nextDraftSeason: string | null;
  teams: { rosterId: string; name: string; estimate: Strategy; evidence: string[]; isMine: boolean }[];
  hasCsvValues: boolean;
}

const selectClass =
  "h-8 rounded-full border border-input bg-input/30 px-3 text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

export function SettingsForm({ leagueId, positions, config, pickSeasons, nextDraftSeason, teams, hasCsvValues }: SettingsFormProps) {
  const [state, action, isPending] = useActionState<ActionState, FormData>(saveSettingsAction.bind(null, leagueId), { ok: true, message: "" });
  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return (
    <form action={action} className="space-y-4">
      <Group title="Trade preferences" id="trade">
        <fieldset className="space-y-2.5">
          <legend className="mb-2.5 text-sm font-medium">Strategy</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STRATEGIES) as Strategy[]).map((s) => (
              <label key={s} className={PILL}>
                <input type="radio" name="strategy" value={s} defaultChecked={config.strategy === s} className="sr-only" />
                {STRATEGIES[s]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2.5">
          <legend className="mb-2.5 text-sm font-medium">
            Target positions <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">· none = weakest two</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {positions.map((p) => (
              <label key={p} className={PILL}>
                <input type="checkbox" name="targetPositions" value={p} defaultChecked={config.targetPositions.includes(p)} className="sr-only" />
                {p}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-end gap-6">
          <div className="space-y-1.5">
            <Label htmlFor="maxPicks">Picks per offer</Label>
            <select id="maxPicks" name="maxPicks" defaultValue={String(config.maxPicks)} className={selectClass}>
              {[0, 1, 2].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "None" : `Up to ${n}`}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 pb-1.5 text-sm">
            <Checkbox name="allowFirsts" defaultChecked={config.allowFirsts} />
            Include 1st-round picks
          </label>
          <div className="space-y-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Label htmlFor="consolidationExponent" className="cursor-help underline decoration-dotted underline-offset-4">
                  Consolidation exponent
                </Label>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Each asset counts as value^k / 10000^(k−1). Above 1, one elite asset outweighs several smaller assets with the same raw total. 1 turns it off.
              </TooltipContent>
            </Tooltip>
            <Input id="consolidationExponent" name="consolidationExponent" type="number" min={1} max={2} step={0.05} defaultValue={config.consolidationExponent} className="h-8 w-24" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="marketProvider">Market values</Label>
            <select id="marketProvider" name="marketProvider" defaultValue={config.marketProvider} className={selectClass}>
              <option value="statsguy">Stats Guy Fantasy</option>
              <option value="csv" disabled={!hasCsvValues}>
                CSV import{hasCsvValues ? "" : " (none imported)"}
              </option>
            </select>
          </div>
        </div>
      </Group>

      <Group title="Draft picks" id="picks">
        <fieldset className="space-y-2">
          <legend className="mb-2.5 text-sm font-medium">Pick seasons</legend>
          <ul className="space-y-2 text-sm">
            {pickSeasons.map((s) => (
              <li key={s.season} className="flex items-center gap-3">
                {s.status === "unconfirmed" || config.confirmedPickSeasons.includes(s.season) ? (
                  <Checkbox name="confirmedPickSeasons" value={s.season} defaultChecked={config.confirmedPickSeasons.includes(s.season)} aria-label={`Confirm ${s.season} picks`} />
                ) : (
                  <span className="size-4" />
                )}
                <span className="num w-12 font-medium">{s.season}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="cursor-help rounded-full border border-foreground/15 px-2.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                      {s.status === "confirmed" ? "Confirmed" : s.status === "unconfirmed" ? "Unconfirmed" : s.status === "consumed" ? "Drafted" : "In progress"}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">{s.reason}</TooltipContent>
                </Tooltip>
              </li>
            ))}
          </ul>
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="draftOrderRules">Draft-order rules</Label>
          <Textarea id="draftOrderRules" name="draftOrderRules" defaultValue={config.draftOrderRules ?? ""} placeholder="e.g. Non-playoff teams ordered by MaxPF" rows={2} className="rounded-2xl" />
        </div>
        {nextDraftSeason ? (
          <fieldset className="space-y-2">
            <legend className="mb-2.5 text-sm font-medium">
              {nextDraftSeason} slots <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">· blank = unknown</span>
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {teams.map((t) => (
                <label key={t.rosterId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{t.name}</span>
                  <Input name={`slot:${t.rosterId}`} type="number" min={1} max={32} defaultValue={config.manualDraftSlots[t.rosterId] ?? ""} className="h-8 w-20" aria-label={`${t.name} draft slot`} />
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
      </Group>

      <Group title="Other managers" id="opponents">
        <ul className="divide-y divide-foreground/[0.06]">
          {teams
            .filter((t) => !t.isMine)
            .map((t) => (
              <li key={t.rosterId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help truncate">{t.name}</span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">{t.evidence.join(" ")}</TooltipContent>
                </Tooltip>
                <select name={`opponent:${t.rosterId}`} defaultValue={config.opponentStrategies[t.rosterId] ?? "estimate"} className={selectClass} aria-label={`${t.name} strategy`}>
                  <option value="estimate">Estimate: {STRATEGIES[t.estimate]}</option>
                  {(Object.keys(STRATEGIES) as Strategy[]).map((s) => (
                    <option key={s} value={s}>
                      {STRATEGIES[s]}
                    </option>
                  ))}
                </select>
              </li>
            ))}
        </ul>
      </Group>

      <div className="sticky bottom-4 z-10 flex w-fit items-center gap-3 rounded-full bg-card/90 p-1.5 pr-4 shadow-lg ring-1 ring-foreground/10 backdrop-blur">
        <Button type="submit" disabled={isPending} size="lg">
          {isPending ? "Saving" : "Save settings"}
        </Button>
        {!state.ok ? <span className="text-sm text-destructive">{state.message}</span> : null}
      </div>
    </form>
  );
}

const PILL =
  "flex h-8 cursor-pointer items-center rounded-full border border-foreground/15 px-3.5 text-sm text-muted-foreground transition-colors hover:text-foreground has-checked:border-foreground has-checked:bg-foreground has-checked:text-background has-focus-visible:ring-2 has-focus-visible:ring-ring/50";

function Group({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-32 space-y-6 rounded-3xl bg-card p-5 sm:p-6">
      <h2 id={`${id}-heading`} className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}
