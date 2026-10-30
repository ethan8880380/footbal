"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteSavedTradeAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function DeleteTradeButton({ leagueId, id }: { leagueId: string; id: number }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button variant="ghost" size="icon-sm" aria-label="Delete saved package" disabled={isPending} onClick={() => startTransition(() => deleteSavedTradeAction(leagueId, id))}>
      <Trash2 />
    </Button>
  );
}
