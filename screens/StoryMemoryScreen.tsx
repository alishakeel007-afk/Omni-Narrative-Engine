"use client";

import ScreenLayout from "@/screens/ScreenLayout";
import { useStory } from "@/context/StoryContext";

export default function StoryMemoryScreen() {
  const { state } = useStory();

  return (
    <ScreenLayout eyebrow="Story Memory" title="Key Events & Memories" description="Important moments the engine has stored for continuity." maxWidth="max-w-4xl">
      <div className="space-y-4">
        {state.memoryTimeline.length === 0 ? (
          <div className="glass-panel rounded-[1.25rem] p-6 text-white/70">No memory items yet.</div>
        ) : (
          state.memoryTimeline.map((m, idx) => (
            <div key={idx} className="glass-panel rounded-[1.25rem] p-4">
              <p className="text-sm text-white/80">{m.result}</p>
              <p className="mt-2 text-xs text-white/60">Choice: {m.choiceType} — {m.userChoice}</p>
            </div>
          ))
        )}
      </div>
    </ScreenLayout>
  );
}
