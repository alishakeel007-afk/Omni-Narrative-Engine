import { redirect } from "next/navigation";
import type { Route } from "next";

/** Preserve previously shared links while using story terminology in new URLs. */
export default async function LegacyStoryLink({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/story/${encodeURIComponent(id)}` as Route);
}
