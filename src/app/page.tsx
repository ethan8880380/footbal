import { Suspense } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { ConnectFlow } from "./_components/connect-flow";

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <main id="main-content" tabIndex={-1} className="relative mx-auto w-full max-w-3xl px-4 py-12 sm:py-20">
      <ThemeToggle className="absolute top-4 right-4" />
      <h1 className="font-dot text-5xl leading-[0.9] font-black tracking-tight sm:text-7xl">
        Dynasty<span className="text-signal">.</span>
        <br />
        Desk
      </h1>
      <Suspense fallback={<ConnectSkeleton />}>
        <ConnectFlow searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function ConnectSkeleton() {
  return (
    <div className="mt-12 space-y-4">
      <Skeleton className="h-28 w-full rounded-3xl" />
      <Skeleton className="h-40 w-full rounded-3xl" />
    </div>
  );
}
