"use client";

import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function HeaderControls({ children }: { children: ReactNode }) {
  return <>
    <div className="hidden min-w-0 flex-1 flex-wrap items-center gap-2 sm:flex">{children}</div>
    <Sheet>
      <SheetTrigger asChild><Button variant="outline" size="icon" className="ml-auto min-h-11 min-w-11 sm:hidden" aria-label="League controls"><SlidersHorizontal /></Button></SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-3xl pb-[max(1.5rem,env(safe-area-inset-bottom))]" aria-describedby={undefined}>
        <SheetHeader><SheetTitle>League controls</SheetTitle></SheetHeader>
        <div className="grid gap-4 px-4 [&>button]:w-full [&>button]:max-w-full">{children}</div>
      </SheetContent>
    </Sheet>
  </>;
}
