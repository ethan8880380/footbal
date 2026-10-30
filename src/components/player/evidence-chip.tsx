import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber } from "@/lib/format";
import type { Evidence } from "@/lib/domain/types";

export function evidenceAnchor(id: string) {
  return `ev-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function formatEvidenceValue(e: Pick<Evidence, "value" | "units">) {
  if (e.value === null) return "unknown";
  if (typeof e.value === "string") return e.value;
  if (e.units === "%") return `${formatNumber(e.value)}%`;
  return `${formatNumber(e.value)} ${e.units}`.trim();
}

export function evidenceWindow(e: Evidence) {
  if (e.season && e.weekStart !== null) return `${e.season}, weeks ${e.weekStart}–${e.weekEnd}`;
  if (e.season) return String(e.season);
  return e.dateRange ?? null;
}

/** Chip-sized value: long unit descriptions move to the tooltip. */
function compactValue(e: Pick<Evidence, "value" | "units">) {
  if (typeof e.value !== "number") return formatEvidenceValue(e);
  if (e.units === "%") return `${formatNumber(e.value)}%`;
  return e.units && e.units.length <= 8 ? `${formatNumber(e.value)} ${e.units}` : formatNumber(e.value);
}

export function EvidenceChip({ evidence }: { evidence: Evidence }) {
  const window = evidenceWindow(evidence);
  const compact = compactValue(evidence);
  const full = formatEvidenceValue(evidence);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={`#${evidenceAnchor(evidence.id)}`}
          className="inline-flex min-h-6 items-center gap-1.5 rounded-full border border-foreground/12 px-2.5 py-0.5 font-mono text-[10px] leading-tight tracking-[0.08em] text-muted-foreground uppercase transition-colors hover:border-foreground/40 hover:text-foreground"
        >
          {evidence.label}
          <span className="text-foreground">{compact}</span>
        </a>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {full !== compact ? <p>{full}</p> : null}
        <p>{evidence.provider}</p>
        {window ? <p>{window}</p> : null}
        {evidence.sampleSize !== null ? <p>Sample: {evidence.sampleSize} {evidence.sampleUnit ?? ""}</p> : null}
      </TooltipContent>
    </Tooltip>
  );
}
