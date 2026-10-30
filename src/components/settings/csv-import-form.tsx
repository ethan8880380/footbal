"use client";

import { useActionState } from "react";
import { importCsvAction, type ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface CsvImportFormProps {
  leagueId: string;
  kind: "values" | "metrics";
  title: string;
  template: string;
}

export function CsvImportForm({ leagueId, kind, title, template }: CsvImportFormProps) {
  const [state, action, isPending] = useActionState<ActionState, FormData>(importCsvAction.bind(null, leagueId, kind), { ok: true, message: "" });
  return (
    <form action={action} className="space-y-3 rounded-2xl bg-foreground/[0.04] p-4">
      <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">{title}</p>
      <Input type="file" name="file" accept=".csv,text/csv" className="h-8 text-xs" aria-label={`${title} file`} />
      <Textarea name="text" rows={3} placeholder={template} className="rounded-2xl font-mono text-xs" aria-label={`${title} CSV text`} />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" variant="outline" disabled={isPending}>
          {isPending ? "Importing" : "Import"}
        </Button>
        {state.message ? <span className={state.ok ? "text-xs text-keep" : "text-xs text-destructive"}>{state.message}</span> : null}
      </div>
    </form>
  );
}
