"use client";

import { useTransition } from "react";
import { setMyRosterAction } from "@/app/actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TeamSelectProps {
  leagueId: string;
  value: string | null;
  teams: { rosterId: string; name: string }[];
}

export function TeamSelect({ leagueId, value, teams }: TeamSelectProps) {
  const [isPending, startTransition] = useTransition();
  return (
    <Select
      value={value ?? undefined}
      onValueChange={(rosterId) => startTransition(() => setMyRosterAction(leagueId, rosterId))}
      disabled={isPending}
    >
      <SelectTrigger size="sm" className="w-full sm:w-auto sm:max-w-[14rem]" aria-label="My team">
        <SelectValue placeholder="Choose your team" />
      </SelectTrigger>
      <SelectContent>
        {teams.map((team) => (
          <SelectItem key={team.rosterId} value={team.rosterId}>
            {team.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
