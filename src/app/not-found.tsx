import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md space-y-5 px-4 py-24 text-center">
      <h1 className="font-dot text-8xl leading-none font-black">
        4<span className="text-signal">0</span>4
      </h1>
      <p className="text-sm text-muted-foreground">Not in your connected data. It may need a sync.</p>
      <Button asChild>
        <Link href="/">All leagues</Link>
      </Button>
    </main>
  );
}
