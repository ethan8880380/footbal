"use client";

import { useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { setAssetFlagAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AssetFlag } from "@/lib/domain/types";

interface AssetFlagMenuProps {
  leagueId: string;
  assetKey: string;
  flag: AssetFlag | null;
  label: string;
  variant?: "icon" | "button";
}

export function AssetFlagMenu({ leagueId, assetKey, flag, label, variant = "icon" }: AssetFlagMenuProps) {
  const [isPending, startTransition] = useTransition();
  const update = (value: string) =>
    startTransition(() => setAssetFlagAction(leagueId, assetKey, value === "none" ? null : (value as AssetFlag)));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "icon" ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Trade availability for ${label}`} disabled={isPending}>
            <MoreHorizontal />
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled={isPending}>
            {flag === "protected" ? "Protected" : flag === "available" ? "Available to trade" : "Trade availability"}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={flag ?? "none"} onValueChange={update}>
          <DropdownMenuRadioItem value="none">No preference</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="available">Available to trade</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="protected">Protected</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
