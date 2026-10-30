"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { explainPlayerAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import type { ExplainResult } from "@/lib/services/explain-service";

interface ExplainPanelProps {
  leagueId: string;
  playerId: string;
  enabled: boolean;
  labels: Record<string, string>;
}

export function ExplainPanel({ leagueId, playerId, enabled, labels }: ExplainPanelProps) {
  const [result, setResult] = useState<ExplainResult | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!enabled) {
    return <p className="text-sm text-muted-foreground">AI explanations are off. The analysis above is computed without a model.</p>;
  }

  const run = () => startTransition(async () => setResult(await explainPlayerAction(leagueId, playerId)));
  const cite = (ids: string[]) =>
    ids.map((id) => (
      <a key={id} href={`#ev-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`} className="ml-1 rounded border px-1 text-[11px] text-muted-foreground hover:text-foreground">
        {labels[id] ?? id}
      </a>
    ));

  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" onClick={run} disabled={isPending}>
        {isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {result ? "Regenerate explanation" : "Explain with AI"}
      </Button>
      {result?.status === "ok" ? (
        <div className="space-y-3 text-sm">
          <p>{result.explanation.summary}</p>
          <ul className="space-y-1.5">
            {result.explanation.reasons.map((r, i) => (
              <li key={i}>
                {r.text}
                {cite(r.evidenceIds)}
              </li>
            ))}
          </ul>
          {result.explanation.counterarguments.length ? (
            <div>
              <p className="font-medium">Counterarguments</p>
              <ul className="mt-1 space-y-1.5">
                {result.explanation.counterarguments.map((c, i) => (
                  <li key={i}>
                    {c.text}
                    {cite(c.evidenceIds)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-muted-foreground">{result.explanation.uncertainty}</p>
          <p className="text-xs text-muted-foreground">
            {result.model}
            {result.cached ? " · cached" : ""} · citations verified against this report&apos;s evidence
          </p>
        </div>
      ) : null}
      {result?.status === "rejected" ? (
        <div className="rounded-md border border-negative/30 bg-negative/10 p-3 text-sm">
          <p className="font-medium">The model&apos;s explanation failed validation and was discarded.</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {result.errors.slice(0, 5).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {result?.status === "error" || result?.status === "disabled" ? <p className="text-sm text-destructive">{result.message}</p> : null}
    </div>
  );
}
