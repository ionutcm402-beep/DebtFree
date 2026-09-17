"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-5 text-center text-ink">
      <section className="w-full max-w-lg border-y border-avalanche bg-sheet p-8">
        <h1 className="font-serif text-4xl">The planner hit a problem</h1>
        <p className="mt-3 text-muted-ink">Reload this page to recover. Your last saved account data will remain available.</p>
        <p className="mt-4 text-sm text-destructive">{error.message}</p>
        <Button className="mt-7 rounded-none" onClick={reset}>Reload planner</Button>
      </section>
    </main>
  );
}
