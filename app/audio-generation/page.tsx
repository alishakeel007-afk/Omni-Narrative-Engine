import { Suspense } from "react";
import AudioGenerationScreen from "@/screens/AudioGenerationScreen";

export default function AudioGenerationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" aria-busy="true" />}>
      <AudioGenerationScreen />
    </Suspense>
  );
}
