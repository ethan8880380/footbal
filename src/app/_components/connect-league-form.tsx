"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { connectLeagueAction, type ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TeamOption {
  rosterId: string;
  label: string;
  owner: string | null;
  isUnowned: boolean;
  isMine: boolean;
  coOwner: boolean;
}

interface ConnectLeagueFormProps {
  leagueId: string;
  userId: string;
  username: string;
  teams: TeamOption[];
}

export function ConnectLeagueForm({ leagueId, userId, username, teams }: ConnectLeagueFormProps) {
  const [state, action, isPending] = useActionState<ActionState, FormData>(connectLeagueAction, { ok: true, message: "" });
  const [rosterId, setRosterId] = useState(teams.find((t) => t.isMine)?.rosterId ?? "");

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="leagueId" value={leagueId} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="username" value={username} />
      <fieldset>
        <legend className="mb-3 font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">Your team</legend>
        <div role="radiogroup" className="grid gap-1.5 sm:grid-cols-2">
          {teams.map((team) => (
            <label
              key={team.rosterId}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-2 rounded-full px-4 py-2 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring/50",
                rosterId === team.rosterId ? "bg-foreground text-background" : "bg-foreground/[0.05] hover:bg-foreground/[0.1]",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <input
                  type="radio"
                  name="rosterId"
                  value={team.rosterId}
                  checked={rosterId === team.rosterId}
                  onChange={() => setRosterId(team.rosterId)}
                  className="sr-only"
                />
                <span className="truncate">{team.label}</span>
              </span>
              <span className={cn("shrink-0 font-mono text-[10px] tracking-[0.1em] uppercase", rosterId === team.rosterId ? "text-background/70" : "text-muted-foreground")}>
                {team.isMine ? (team.coOwner ? "You (co-owner)" : "You") : team.isUnowned ? "Unowned" : team.owner}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!rosterId || isPending}>
          {isPending ? <Loader2 className="animate-spin" /> : null}
          {isPending ? "Importing" : "Connect league"}
        </Button>
        {!state.ok && state.message ? <span role="alert" className="text-sm text-destructive">{state.message}</span> : null}
      </div>
    </form>
  );
}
