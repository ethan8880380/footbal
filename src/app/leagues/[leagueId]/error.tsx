"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LeagueError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md space-y-5 py-16 text-center">
      <span className="mx-auto block size-3 rounded-full bg-negative" aria-hidden />
      <h1 className="font-dot text-4xl leading-none font-black">Didn&apos;t load</h1>
      <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : "Unexpected error."} Saved data is unaffected.</p>
      <div className="flex justify-center gap-2">
        <Button onClick={() => retry()}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">All leagues</Link>
        </Button>
      </div>
    </div>
  );
}
