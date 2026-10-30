"use client";

import { useTransition } from "react";
import { setStrategyAction } from "@/app/actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STRATEGIES, type Strategy } from "@/lib/domain/types";

export function StrategySelect({ leagueId, value }: { leagueId: string; value: Strategy }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Select value={value} onValueChange={(next) => startTransition(() => setStrategyAction(leagueId, next))} disabled={isPending}>
      <SelectTrigger size="sm" className="w-full sm:w-auto" aria-label="Strategy">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(STRATEGIES).map(([key, label]) => (
          <SelectItem key={key} value={key}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
