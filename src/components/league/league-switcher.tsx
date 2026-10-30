"use client";

import Link from "next/link";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface LeagueOption {
  leagueId: string;
  name: string;
  season: string;
}

export function LeagueSwitcher({ current, leagues }: { current: LeagueOption; leagues: LeagueOption[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full min-w-0 justify-between gap-1.5 sm:w-auto sm:max-w-[16rem] font-medium">
          <span className="truncate">{current.name}</span>
          <span className="text-muted-foreground">{current.season}</span>
          <ChevronsUpDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {leagues.map((league) => (
          <DropdownMenuItem key={league.leagueId} asChild>
            <Link href={`/leagues/${league.leagueId}`} className="flex items-center justify-between gap-2">
              <span className="truncate">{league.name}</span>
              {league.leagueId === current.leagueId ? <Check className="size-4" /> : <span className="text-xs text-muted-foreground">{league.season}</span>}
            </Link>
          </DropdownMenuItem>
        ))}
        {leagues.length ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem asChild>
          <Link href="/">
            <Plus className="size-4" />
            Connect another league
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/leagues/demo">Demo league</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
