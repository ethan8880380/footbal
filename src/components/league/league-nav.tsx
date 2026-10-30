"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "", label: "Overview" },
  { href: "/roster", label: "Roster" },
  { href: "/matchup", label: "Matchup" },
  { href: "/start-sit", label: "Start / Sit" },
  { href: "/league", label: "League" },
  { href: "/plan", label: "Plan" },
  { href: "/prospects", label: "Prospects" },
  { href: "/targets", label: "Targets" },
  { href: "/trade-lab", label: "Trade lab" },
  { href: "/settings", label: "Settings" },
];

export function LeagueNav({ leagueId }: { leagueId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/leagues/${leagueId}`;
  const current = TABS.find(tab => tab.href && pathname.startsWith(`${base}${tab.href}`))?.href ?? "";
  return (
    <nav aria-label="League sections" className="mx-auto max-w-7xl overflow-x-auto px-4 pb-3">
      <select aria-label="League section" value={current} onChange={event => router.push(`${base}${event.target.value}`)} className="h-11 w-full rounded-full border border-input bg-card px-4 font-medium sm:hidden">
        {TABS.map(tab => <option key={tab.label} value={tab.href}>{tab.label}</option>)}
      </select>
      <ul className="hidden gap-1 rounded-full bg-card p-1 sm:inline-flex">
        {TABS.map((tab) => {
          const href = `${base}${tab.href}`;
          const active = tab.href === "" ? pathname === base || pathname.startsWith(`${base}/players`) : pathname.startsWith(href);
          return (
            <li key={tab.label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 w-full items-center justify-center rounded-full px-3.5 sm:h-9 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                  active && "bg-foreground font-medium text-background hover:text-background",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
