import { Suspense } from "react";
import DashboardScreen from "@/screens/DashboardScreen";

/**
 * The dashboard reads `?start=` to pick up the landing demo's handoff, which
 * means `useSearchParams` and therefore a Suspense boundary — without one the
 * page cannot be prerendered at all.
 */
export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-5xl px-6 py-12">
          <p className="text-sm text-[var(--muted)]">Loading your stories…</p>
        </main>
      }
    >
      <DashboardScreen />
    </Suspense>
  );
}
