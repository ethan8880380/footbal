import Image from "next/image";
import { cn } from "@/lib/utils";

/** Sleeper headshot over an initials disc, so missing photos fall back cleanly. */
export function PlayerAvatar({ playerId, name, size = 28, className }: { playerId: string; name: string; size?: number; className?: string }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
  return (
    <span className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-foreground/[0.08] font-mono text-[9px] text-muted-foreground", className)} style={{ width: size, height: size }}>
      {initials}
      {/^\d+$/.test(playerId) ? (
        <Image
          src={`https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`}
          alt=""
          width={size}
          height={size}
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
    </span>
  );
}
