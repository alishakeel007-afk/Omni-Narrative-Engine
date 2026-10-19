import Link from "next/link";
import ScreenLayout from "@/screens/ScreenLayout";

export default function NotFoundScreen() {
  return (
    <ScreenLayout eyebrow="Page Not Found" title="This scene is missing." description="The requested route is not available in this Omni-Narrative build." maxWidth="max-w-2xl">
      <div className="text-center">
        <Link
          href="/"
          className="mt-8 inline-flex rounded-full bg-[var(--accent)] px-7 py-4 text-sm font-semibold text-[var(--ink)]"
        >
          Return Home
        </Link>
      </div>
    </ScreenLayout>
  );
}
