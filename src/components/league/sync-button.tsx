"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { refreshLeagueAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SyncButtonProps {
  leagueId: string;
  /** Rendered on the server so hydration never sees a different relative time. */
  syncedLabel: string;
  issues: number;
}

export function SyncButton({ leagueId, syncedLabel, issues }: SyncButtonProps) {
  const [isPending, startTransition] = useTransition();
  const sync = () =>
    startTransition(async () => {
      const result = await refreshLeagueAction(leagueId, false);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="sm" onClick={sync} disabled={isPending} className="gap-2">
          <RefreshCw className={cn(isPending && "animate-spin")} />
          <span className="hidden font-mono text-[10px] tracking-[0.12em] uppercase sm:inline">{isPending ? "Syncing" : syncedLabel}</span>
          {issues > 0 && !isPending ? <span className="size-1.5 rounded-full bg-negative" aria-label={`${issues} sources need attention`} /> : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Refresh Sleeper, stats, and values. Sources refresh on their own cadence.</TooltipContent>
    </Tooltip>
  );
}
