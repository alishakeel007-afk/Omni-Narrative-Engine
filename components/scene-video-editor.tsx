"use client";

import { useEffect, useRef, useState } from "react";

type Settings = { start: number; end: number; voiceDelay: number; voiceVolume: number; musicVolume: number; effectsVolume: number; videoVolume: number };
const defaults: Settings = { start: 0, end: 0, voiceDelay: 0, voiceVolume: 1, musicVolume: 0.2, effectsVolume: 0.5, videoVolume: 0 };

export function SceneVideoEditor({ url, storageKey, voiceUrls = [], musicUrl }: { url: string; storageKey: string; voiceUrls?: string[]; musicUrl?: string }) {
  const [settings, setSettings] = useState(defaults);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState("");
  const [uploads, setUploads] = useState<Record<string, string>>({});
  const video = useRef<HTMLVideoElement>(null);
  const voices = useRef<(HTMLAudioElement | null)[]>([]);
  const music = useRef<HTMLAudioElement>(null);
  const effects = useRef<HTMLAudioElement>(null);
  const objectUrls = useRef<string[]>([]);
  const key = `${storageKey}:edit`;

  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(key) || "null"); setSettings(saved ? { ...defaults, ...saved } : defaults); } catch { setSettings(defaults); }
  }, [key]);
  useEffect(() => () => { objectUrls.current.forEach(value => URL.revokeObjectURL(value)); }, []);
  useEffect(() => {
    if (video.current) video.current.volume = settings.videoVolume;
    voices.current.forEach(audio => { if (audio) audio.volume = settings.voiceVolume; });
    if (music.current) music.current.volume = settings.musicVolume;
    if (effects.current) effects.current.volume = settings.effectsVolume;
  }, [settings, uploads]);

  const effectiveVoices = uploads.voice ? [uploads.voice] : voiceUrls;
  function pauseAudio() {
    voices.current.forEach(audio => audio?.pause());
    music.current?.pause();
    effects.current?.pause();
  }
  function sync(force = false) {
    const element = video.current;
    if (!element) return;
    const time = Math.max(0, element.currentTime - settings.start);
    const shouldPlay = !element.paused && !element.ended;
    const align = (audio: HTMLAudioElement | null, target: number, loop: boolean) => {
      if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      const active = target >= 0 && (loop || target < audio.duration);
      if (!active) { audio.pause(); return; }
      const offset = loop ? target % audio.duration : target;
      if (force || Math.abs(audio.currentTime - offset) > 0.35) audio.currentTime = offset;
      if (shouldPlay && audio.paused) audio.play().catch(() => { setMessage("An audio track could not play. Check its source or choose another file."); });
      if (!shouldPlay) audio.pause();
    };
    let voiceStart = settings.voiceDelay;
    voices.current.slice(0, effectiveVoices.length).forEach(audio => {
      align(audio, time - voiceStart, false);
      voiceStart += audio && Number.isFinite(audio.duration) ? audio.duration : Number.POSITIVE_INFINITY;
    });
    align(music.current, time, true);
    align(effects.current, time, true);
    setPosition(element.currentTime);
    if (settings.end > settings.start && element.currentTime >= settings.end) { element.pause(); pauseAudio(); }
  }
  function toggle() {
    const element = video.current;
    if (!element) return;
    if (settings.end > 0 && settings.end <= settings.start) {
      setMessage("Set trim end after trim start before playing.");
      return;
    }
    if (!element.paused) { element.pause(); return; }
    if (element.currentTime < settings.start || element.currentTime >= (settings.end || duration)) element.currentTime = settings.start;
    element.play().catch(() => setMessage("Unable to play this video. Refresh the clip or select another file."));
  }
  function upload(kind: string, file?: File) {
    if (!file) return;
    video.current?.pause(); pauseAudio();
    const value = URL.createObjectURL(file); objectUrls.current.push(value);
    setUploads(current => ({ ...current, [kind]: value }));
    setMessage("Uploaded files are available for this visit. Saved edits preserve timing and volume settings.");
  }
  function numberField(label: string, field: "start" | "end" | "voiceDelay", max: number) {
    return <label className="grid gap-1 text-sm">{label}<input className="rounded-lg border border-slate-300 bg-white p-2 text-slate-900" type="number" min={0} max={max} step={0.1} value={settings[field]} onChange={event => {
      const value = Math.max(0, Math.min(max, Number(event.target.value) || 0));
      video.current?.pause(); pauseAudio();
      setSettings(current => ({ ...current, [field]: value }));
    }} /></label>;
  }
  return <section className="mt-4 space-y-4 rounded-2xl border border-slate-300 bg-slate-50 p-4 text-slate-900">
    <h4 className="text-lg font-semibold">Edit scene video</h4>
    <video ref={video} src={uploads.video || url} playsInline preload="metadata" className="w-full rounded-xl bg-black" onLoadedMetadata={() => {
      const element = video.current!; setDuration(element.duration); element.volume = settings.videoVolume;
      if (settings.start < element.duration) element.currentTime = settings.start;
    }} onPlay={() => { setPlaying(true); sync(true); }} onPause={() => { setPlaying(false); pauseAudio(); }} onTimeUpdate={() => sync()} onSeeked={() => sync(true)} onEnded={() => { setPlaying(false); pauseAudio(); }} onError={() => setMessage("The video could not load. Refresh the generated clip or choose a replacement video.")} />
    <div className="flex items-center gap-3"><button type="button" className="rounded-full bg-slate-900 px-4 py-2 text-white" onClick={toggle}>{playing ? "Pause preview" : "Play with audio"}</button><span className="text-sm">{position.toFixed(1)} / {duration.toFixed(1)} sec</span></div>
    <input aria-label="Video timeline" type="range" min={settings.start} max={Math.max(settings.start, settings.end || duration)} step={0.05} value={Math.min(Math.max(position, settings.start), settings.end || duration)} className="w-full" onChange={event => { if (video.current) video.current.currentTime = Number(event.target.value); sync(true); }} />
    <div className="grid gap-3 sm:grid-cols-3">{numberField("Trim start (seconds)", "start", Math.max(0, (settings.end || duration) - 0.1))}{numberField("Trim end (0 = full clip)", "end", duration)}{numberField("Dialogue delay (seconds)", "voiceDelay", duration)}</div>
    {settings.end > 0 && settings.end <= settings.start && <p role="alert" className="text-red-700">Trim end must be after trim start.</p>}
    <div className="grid gap-3 sm:grid-cols-2">{([["Dialogue", "voiceVolume"], ["Background music", "musicVolume"], ["Sound effects", "effectsVolume"], ["Original video audio", "videoVolume"]] as const).map(([label, field]) => <label key={field} className="text-sm">{label}: {Math.round(settings[field] * 100)}%<input aria-label={`${label} volume`} className="block w-full" type="range" min={0} max={1} step={0.01} value={settings[field]} onChange={event => setSettings(current => ({ ...current, [field]: Number(event.target.value) }))} /></label>)}</div>
    <div className="grid gap-3 sm:grid-cols-2">{([['video', 'Replace video', 'video/*'], ['voice', 'Add dialogue / narration', 'audio/*'], ['music', 'Add background music', 'audio/*'], ['effects', 'Add background sound / effects', 'audio/*']] as const).map(([kind, label, accept]) => <label key={kind} className="grid gap-1 text-sm">{label}<input className="w-full text-xs" type="file" accept={accept} onChange={event => upload(kind, event.target.files?.[0])} /></label>)}</div>
    <p className="text-sm">{effectiveVoices.length} dialogue clips attached. Music: {uploads.music || musicUrl ? "attached" : "none"}. Audio plays from the trimmed start; dialogue clips play in order.</p>
    <div className="flex flex-wrap gap-3"><button type="button" disabled={settings.end > 0 && settings.end <= settings.start} className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50" onClick={() => { try { localStorage.setItem(key, JSON.stringify(settings)); setMessage("Timing and volume edits saved in this browser."); } catch { setMessage("Unable to save edits: browser storage is full or unavailable."); } }}>Save edits</button><button type="button" className="rounded-full border border-slate-400 px-4 py-2 text-sm" onClick={() => { video.current?.pause(); pauseAudio(); setSettings(defaults); setUploads({}); setMessage("Edits reset. Save to keep the reset settings."); }}>Reset edits</button></div>
    <p className="text-xs text-slate-600">This editor previews the mix. Scene downloads contain the original video; timing and audio edits are not embedded in that file.</p>
    {message && <p role="status" className="text-sm">{message}</p>}
    {effectiveVoices.map((source, index) => <audio key={`${index}:${source}`} ref={element => { voices.current[index] = element; }} src={source} preload="metadata" onLoadedMetadata={() => { if (voices.current[index]) voices.current[index]!.volume = settings.voiceVolume; }} onEnded={() => sync(true)} onError={() => setMessage("A dialogue clip could not load. You can replace it using Add dialogue / narration.")} />)}
    <audio ref={music} src={uploads.music || musicUrl} loop preload="metadata" onLoadedMetadata={() => { if (music.current) music.current.volume = settings.musicVolume; }} />
    <audio ref={effects} src={uploads.effects} loop preload="metadata" onLoadedMetadata={() => { if (effects.current) effects.current.volume = settings.effectsVolume; }} />
  </section>;
}
