import { cn } from "@/lib/utils";

interface ReadoutProps {
  value: string;
  unit?: string;
  muted?: boolean;
  className?: string;
}

export function Readout({ value, unit, muted = false, className }: ReadoutProps) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span className={cn("num font-dot text-3xl leading-none font-black tracking-tight sm:text-4xl", muted && "text-muted-foreground")}>{value}</span>
      {unit ? <MonoLabel>{unit}</MonoLabel> : null}
    </span>
  );
}

export function MonoLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-mono text-[10px] leading-none tracking-[0.14em] text-muted-foreground uppercase", className)}>{children}</span>;
}
