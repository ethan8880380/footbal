import { DotStack } from "@/components/viz/dot-meter";
import { cn } from "@/lib/utils";
import { EVIDENCE_STRENGTH_LABELS, type EvidenceStrength as Strength } from "@/lib/domain/recommendations";

const LEVELS: Record<Strength, number> = { limited: 1, moderate: 2, strong: 3 };

export function EvidenceStrength({ strength, className }: { strength: Strength; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs text-muted-foreground", className)}>
      <span className="flex items-end gap-[3px]" aria-hidden>
        {[1, 2, 3].map((level) => (
          <DotStack key={level} rows={level} lit={level <= LEVELS[strength] ? level : 0} size="sm" />
        ))}
      </span>
      {EVIDENCE_STRENGTH_LABELS[strength]}
    </span>
  );
}
