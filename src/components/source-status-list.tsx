import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import type { SourceStatus } from "@/lib/domain/types";

const STATE_STYLES: Record<SourceStatus["state"], { dot: string; label: string }> = {
  fresh: { dot: "bg-foreground", label: "Current" },
  partial: { dot: "bg-foreground/40", label: "Partial" },
  stale: { dot: "bg-negative", label: "Stale" },
  error: { dot: "bg-negative", label: "Error" },
  unavailable: { dot: "ring-1 ring-inset ring-foreground/30", label: "Unavailable" },
};

export function SourceStatusDot({ state }: { state: SourceStatus["state"] }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", STATE_STYLES[state].dot)} aria-label={STATE_STYLES[state].label} />;
}

/** Compact grid by default; `detailed` adds timestamps, notes, and links for diagnostics. */
export function SourceStatusList({ sources, detailed = false }: { sources: SourceStatus[]; detailed?: boolean }) {
  if (!detailed) {
    return (
      <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {sources.map((source) => (
          <li key={source.id} className="flex items-center gap-2.5 text-sm" title={source.detail ?? undefined}>
            <SourceStatusDot state={source.state} />
            <span className={cn("truncate", source.state === "unavailable" && "text-muted-foreground")}>{source.label}</span>
            {source.state !== "fresh" ? <span className="ml-auto shrink-0 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">{STATE_STYLES[source.state].label}</span> : null}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="divide-y">
      {sources.map((source) => (
        <li key={source.id} className="flex items-start gap-3 py-3 text-sm">
          <span className="mt-1.5">
            <SourceStatusDot state={source.state} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-medium">{source.label}</span>
              <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                {STATE_STYLES[source.state].label}
                {source.retrievedAt ? ` · ${formatDateTime(source.retrievedAt)}` : ""}
              </span>
            </div>
            {source.detail ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {source.detail}
                {source.dataCutoff ? ` Data through ${source.dataCutoff.length > 12 ? formatDateTime(source.dataCutoff) : source.dataCutoff}.` : ""}
              </p>
            ) : null}
            {source.sourceUrl?.startsWith("http") ? (
              <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-xs text-muted-foreground underline-offset-2 hover:underline">
                {source.sourceUrl}
              </a>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
