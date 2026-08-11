"use client";

import { useEffect, useState } from "react";
import ScreenLayout from "@/screens/ScreenLayout";
import Link from "next/link";
import { STORY_COMPLETED_STORAGE_KEY } from "@/lib/story-storage";

type ExportRecord = {
  title: string;
  endedAt: string;
  exportedAt: string;
  text: string;
};

export default function StoryExports() {
  const [record, setRecord] = useState<ExportRecord | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORY_COMPLETED_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ExportRecord;
      setRecord(parsed);
    } catch (e) {
      setRecord(null);
    }
  }, []);

  const download = () => {
    if (!record) return;
    const blob = new Blob([record.text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${record.title.replace(/[^a-z0-9]/gi, "_")}_final.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const play = () => {
    if (!record) return;
    if (!("speechSynthesis" in window)) {
      alert("Browser does not support SpeechSynthesis.");
      return;
    }

    const synth = window.speechSynthesis;
    if (playing) {
      synth.cancel();
      setPlaying(false);
      return;
    }

    const u = new SpeechSynthesisUtterance(record.text);
    u.rate = 1;
    u.onend = () => setPlaying(false);
    synth.speak(u);
    setPlaying(true);
  };

  const clear = () => {
    window.localStorage.removeItem(STORY_COMPLETED_STORAGE_KEY);
    setRecord(null);
  };

  return (
    <ScreenLayout eyebrow="Exports" title="Finalized Stories" description="View, play and download finalized story exports." maxWidth="max-w-4xl">
      <div className="space-y-6">
        <div className="rounded-[1rem] border border-white/6 bg-black/10 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-[var(--font-heading)] text-white">Export History</h3>
            <Link href="/story/overview" className="text-sm text-white/70 hover:underline">Overview</Link>
          </div>

          {!record ? (
            <div className="mt-6 text-sm text-white/70">No finalized story found. Use "End Story / Export" in Play mode to finalize a run.</div>
          ) : (
            <div className="mt-6 grid gap-4">
              <div className="rounded-md border border-white/8 bg-black/15 p-4">
                <p className="text-sm text-white/70">Title</p>
                <h4 className="mt-1 text-lg text-white">{record.title}</h4>
                <p className="mt-2 text-xs text-white/90">Finalized: {new Date(record.endedAt).toLocaleString()}</p>
              </div>

              <div className="rounded-md border border-white/8 bg-black/12 p-4">
                <p className="text-sm text-white/70">Preview</p>
                <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-sm text-white/75">{record.text}</pre>
              </div>

              <div className="flex gap-3">
                <button onClick={play} className="rounded-md bg-aurora/10 px-4 py-2 text-sm text-aurora">{playing ? "Stop" : "Play TTS"}</button>
                <button onClick={download} className="rounded-md bg-starlight/10 px-4 py-2 text-sm text-starlight">Download Text</button>
                <button onClick={clear} className="ml-auto rounded-md bg-red-600/10 px-4 py-2 text-sm text-red-400">Remove Export</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ScreenLayout>
  );
}
