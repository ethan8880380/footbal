import { cn } from "@/lib/utils";

const TONES = {
  default: "border-foreground/15 text-foreground/80",
  muted: "border-foreground/10 text-muted-foreground",
  signal: "border-signal/50 text-signal",
  negative: "border-negative/40 text-negative",
  solid: "border-foreground bg-foreground text-background",
} as const;

interface TagProps {
  children: React.ReactNode;
  tone?: keyof typeof TONES;
  className?: string;
}

export function Tag({ children, tone = "default", className }: TagProps) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[10px] tracking-[0.12em] whitespace-nowrap uppercase", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function TagList({ items, className }: { items: (string | null | false | undefined)[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {items.filter(Boolean).map((item) => (
        <Tag key={item as string}>{item}</Tag>
      ))}
    </div>
  );
}
