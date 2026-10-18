import { Suspense } from "react";
import StoryBuilderScreen from "@/screens/StoryBuilderScreen";

export default function StoryBuilderPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" aria-busy="true" />}>
      <StoryBuilderScreen />
    </Suspense>
  );
}
