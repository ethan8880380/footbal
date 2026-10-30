import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface WidgetProps {
  label?: string;
  href?: string;
  linkLabel?: string;
  action?: React.ReactNode;
  id?: string;
  className?: string;
  children: React.ReactNode;
}

/** Nothing-style card: mono label top-left, optional round arrow link top-right. */
export function Widget({ label, href, linkLabel, action, id, className, children }: WidgetProps) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={cn("scroll-mt-32 rounded-3xl bg-card p-5 sm:p-6", className)}>
      {label || href || action ? (
        <header className="mb-4 flex min-h-8 items-center justify-between gap-3">
          {label ? (
            <h2 id={headingId} className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
              {label}
            </h2>
          ) : (
            <span />
          )}
          {action ??
            (href ? (
              <Link
                href={href}
                aria-label={linkLabel ?? label}
                className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground/[0.06] text-muted-foreground transition-colors hover:bg-foreground hover:text-background focus-visible:bg-foreground focus-visible:text-background focus-visible:outline-none"
              >
                <ArrowUpRight className="size-4" />
              </Link>
            ) : null)}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function StatTile({ label, value, children, className }: { label: string; value: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col justify-between gap-4 rounded-3xl bg-card p-5", className)}>
      <span className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">{label}</span>
      <div className="space-y-3">
        <div className="num font-dot text-4xl leading-none font-black tracking-tight">{value}</div>
        {children}
      </div>
    </div>
  );
}
