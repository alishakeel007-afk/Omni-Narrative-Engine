"use client";

import { useEffect, useMemo, useState } from "react";
import { useStory } from "@/context/StoryContext";
import { STORY_COMPLETED_STORAGE_KEY } from "@/lib/story-storage";

type ExportModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function ExportModal({ open, onClose }: ExportModalProps) {
  const { setup, state } = useStory();
  const [isExporting, setIsExporting] = useState(false);
  const [ttsPlaying, setTtsPlaying] = useState(false);

  const assembledText = useMemo(() => {
    const parts: string[] = [];
    parts.push(`${setup.storyTitle}\n\n`);
    // include current scene
    if (state.currentScene) {
      parts.push(`Scene ${state.currentScene.sceneNumber}: ${state.currentScene.title}\n`);
      parts.push(state.currentScene.text + "\n\n");
    }
    // include memory timeline summaries
    if (state.memoryTimeline?.length) {
      parts.push("Memory Timeline:\n");
      state.memoryTimeline.forEach((m) => {
        parts.push(`- [${m.timestamp}] ${m.userChoice} -> ${m.result}\n`);
      });
    }
    return parts.join("\n");
  }, [setup, state]);

  useEffect(() => {
    if (!open) {
      setIsExporting(false);
      setTtsPlaying(false);
    }
  }, [open]);

  const downloadText = () => {
    const blob = new Blob([assembledText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${setup.storyTitle.replace(/[^a-z0-9]/gi, "_")}_export.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const speakText = () => {
    if (!("speechSynthesis" in window)) {
      alert("TTS not supported in this browser.");
      return;
    }

    const synth = window.speechSynthesis;
    if (ttsPlaying) {
      synth.cancel();
      setTtsPlaying(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(assembledText);
    utterance.rate = 1;
    utterance.onend = () => setTtsPlaying(false);
    synth.speak(utterance);
    setTtsPlaying(true);
  };

  const finalizeStory = () => {
    setIsExporting(true);
    try {
      const payload = {
        title: setup.storyTitle,
        endedAt: new Date().toISOString(),
        exportedAt: new Date().toISOString(),
        text: assembledText
      };
      window.localStorage.setItem(STORY_COMPLETED_STORAGE_KEY, JSON.stringify(payload));
      // also mark progress with endedAt for convenience
      const existing = window.localStorage.getItem("omni-narrative-engine-story-state");
      if (existing) {
        try {
          const obj = JSON.parse(existing);
          obj.endedAt = payload.endedAt;
          window.localStorage.setItem("omni-narrative-engine-story-state", JSON.stringify(obj));
        } catch {
          // ignore
        }
      }
    } finally {
      setTimeout(() => {
        setIsExporting(false);
        onClose();
        alert("Story finalized and saved. You can now access exported text or generate media.");
      }, 700);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl rounded-xl bg-[#14061a] p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-[var(--font-heading)] text-white">Export & End Story</h3>
            <p className="mt-1 text-sm text-white/70">Finalize this run and export as text or play TTS audio.</p>
          </div>
          <button onClick={onClose} className="text-white/90">Close</button>
        </div>

        <div className="mt-4 grid gap-3">
          <div className="rounded-md border border-white/6 bg-black/10 p-3">
            <p className="text-sm text-white/80">Export preview (first 500 chars)</p>
            <pre className="mt-2 max-h-36 overflow-auto text-xs text-white/70 whitespace-pre-wrap">{assembledText.slice(0, 500)}{assembledText.length>500?"...":""}</pre>
          </div>

          <div className="flex gap-3">
            <button onClick={downloadText} className="rounded-md bg-starlight/10 px-4 py-2 text-sm text-starlight">Download Text</button>
            <button onClick={speakText} className="rounded-md bg-aurora/10 px-4 py-2 text-sm text-aurora">{ttsPlaying?"Stop TTS":"Play TTS (browser)"}</button>
            <button onClick={finalizeStory} disabled={isExporting} className="ml-auto rounded-md bg-gradient-to-r from-aurora via-starlight to-gold px-4 py-2 text-sm text-slate-950">{isExporting?"Finalizing...":"Finalize Story"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
