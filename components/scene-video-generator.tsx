"use client";

import { useEffect, useState } from "react";
import { SceneVideoEditor } from "@/components/scene-video-editor";

type Job = { id: string; token: string; status: string; url?: string; error?: string };
export function SceneVideoGenerator({ prompt, title, voiceUrls, musicUrl }: { prompt: string; title: string; voiceUrls?: string[]; musicUrl?: string }) {
  const storageKey = `omni-magic-hour:${title}:${prompt}`;
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(0);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    try { setJob(JSON.parse(localStorage.getItem(storageKey) || "null")); } catch { setJob(null); }
    setError("");
  }, [storageKey]);

  useEffect(() => {
    if (!job || ["error", "canceled"].includes(job.status)) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch(`/api/video/render?id=${encodeURIComponent(job.id)}&token=${encodeURIComponent(job.token)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not check video status.");
        if (stopped) return;
        const updated = { ...job, ...data };
        if (updated.status !== job.status || updated.url !== job.url || updated.error !== job.error) setJob(updated);
        try { localStorage.setItem(storageKey, JSON.stringify(updated)); } catch { /* Playback still works when storage is full. */ }
        setError("");
        if (updated.status === job.status && updated.url === job.url && !["complete", "error", "canceled"].includes(updated.status)) timer = setTimeout(poll, 5000);
      } catch (cause) {
        if (!stopped) setError(cause instanceof Error ? cause.message : "Could not check video status.");
      }
    };
    timer = setTimeout(poll, 1500);
    return () => { stopped = true; clearTimeout(timer); };
  }, [job, storageKey, checking]);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/video/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, name: title.slice(0, 200), duration: 5 }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Video generation failed.");
      setJob(data);
      try { localStorage.setItem(storageKey, JSON.stringify(data)); } catch { /* Keep the active job in memory. */ }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Video generation failed."); }
    finally { setBusy(false); }
  }

  const active = job && !["complete", "error", "canceled"].includes(job.status);
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-white/20 p-4">
      <p className="text-sm text-white/90">5-second scene clip · Magic Hour · 480p</p>
      {job?.url && <video controls playsInline src={job.url} className="w-full rounded-xl" />}
      {job?.url && <a href={job.url} target="_blank" rel="noreferrer" className="inline-block text-sm underline">Download scene clip</a>}
      {job?.url && <button type="button" onClick={() => setEditing(value => !value)} className="ml-3 rounded-full border border-slate-400 px-4 py-2 text-sm">{editing ? "Close editor" : "Add video to editor"}</button>}
      {editing && job?.url && <SceneVideoEditor url={job.url} storageKey={storageKey} voiceUrls={voiceUrls} musicUrl={musicUrl} />}
      <p role="status" className="text-sm text-white/90">{busy ? "Submitting scene…" : job ? `Video: ${job.status}` : "Generate a scene clip using your Magic Hour credits."}</p>
      {(error || job?.error) && <p role="alert" className="text-sm text-red-300">{error || job?.error}</p>}
      {active ? <button type="button" onClick={() => { setError(""); setChecking(value => value + 1); }} className="rounded-full border border-white/30 px-4 py-2 text-sm">Check status</button> : <button type="button" disabled={busy || !prompt.trim()} onClick={generate} className="rounded-full border border-white/30 px-4 py-2 text-sm disabled:opacity-50">{job ? "Generate another clip" : "Generate video clip"}</button>}
      {job?.status === "complete" && !job.url && <p className="text-sm">No download is available for this clip.</p>}
    </div>
  );
}
