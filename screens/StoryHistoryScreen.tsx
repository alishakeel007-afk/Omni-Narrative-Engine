"use client";

import ScreenLayout from "@/screens/ScreenLayout";
import { useStory } from "@/context/StoryContext";

export default function StoryHistoryScreen() {
  const { state } = useStory();

  return (
    <ScreenLayout eyebrow="Story History" title="All Scenes" description="Browse full scene history and re-open past moments." maxWidth="max-w-4xl">
      <div className="space-y-4">
        {state.pastScenes && state.pastScenes.length > 0 ? (
          state.pastScenes.map((s, idx) => (
            <div key={idx} className="glass-panel rounded-[1.25rem] p-4">
              <p className="font-semibold text-white">Scene {s.sceneNumber}: {s.title}</p>
              <p className="mt-2 text-sm text-white/70">{s.summary || s.text}</p>
            </div>
          ))
        ) : (
          <div className="glass-panel rounded-[1.25rem] p-6 text-white/70">No past scenes yet.</div>
        )}
      </div>
    </ScreenLayout>
  );
}
