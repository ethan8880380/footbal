import { cn } from "@/lib/utils";
import type { Recommendation } from "@/lib/domain/types";

const STYLES: Record<Recommendation, { label: string; dot: string; text: string }> = {
  keep: { label: "Keep", dot: "bg-foreground", text: "text-foreground" },
  shop: { label: "Shop", dot: "bg-negative", text: "text-negative" },
  monitor: { label: "Monitor", dot: "bg-foreground/45", text: "text-foreground/75" },
  insufficient: { label: "Unscored", dot: "ring-1 ring-inset ring-foreground/40", text: "text-muted-foreground" },
};

interface RecommendationBadgeProps {
  recommendation: Recommendation;
  size?: "sm" | "lg";
  className?: string;
}

export function RecommendationBadge({ recommendation, size = "sm", className }: RecommendationBadgeProps) {
  const style = STYLES[recommendation];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-foreground/15 font-mono tracking-[0.12em] whitespace-nowrap uppercase",
        size === "lg" ? "h-8 gap-2 px-3.5 text-xs" : "h-6 gap-1.5 px-2.5 text-[10px]",
        style.text,
        className,
      )}
    >
      <span className={cn("shrink-0 rounded-full", size === "lg" ? "size-2" : "size-1.5", style.dot)} />
      {style.label}
    </span>
  );
}
