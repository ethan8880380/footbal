import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface PageHeadingProps {
  title: string;
  meta?: React.ReactNode;
  level?: 1 | 2;
  action?: React.ReactNode;
}

export function PageHeading({ title, meta, level = 1, action }: PageHeadingProps) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", level === 1 && "pb-4")}>
      <div className="min-w-0 space-y-3">
        <Heading className={cn("font-dot leading-none font-black tracking-tight", level === 1 ? "text-4xl sm:text-5xl" : "text-2xl sm:text-3xl")}>{title}</Heading>
        {meta ? <div className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">{meta}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-56 rounded-full" />
      <div className="space-y-2 rounded-3xl bg-card p-4">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-44 w-full rounded-3xl" />
      ))}
    </div>
  );
}

export function NoTeamNotice() {
  return <Notice title="Choose your team">Use the team selector in the header.</Notice>;
}

export function NoMarketNotice({ leagueId }: { leagueId: string }) {
  return (
    <Notice title="No market values">
      Sync the league or{" "}
      <Link href={`/leagues/${leagueId}/settings#import`} className="text-foreground underline underline-offset-4">
        import a CSV
      </Link>
      .
    </Notice>
  );
}

export function Notice({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-3xl bg-card px-5 py-4">
      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-signal" aria-hidden />
      <div className="text-sm">
        <p className="font-medium">{title}</p>
        {children ? <div className="mt-0.5 text-muted-foreground">{children}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-foreground/15 px-6 py-12 text-center">
      <p className="font-dot text-2xl font-black">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}
