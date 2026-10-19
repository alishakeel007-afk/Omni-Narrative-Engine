"use client";
import { filmContinuityProblem } from "@/lib/studio/identity";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Play,
  Plus,
  Square,
  X,
} from "lucide-react";
import {
  DEFAULT_STUDIO_EDIT,
  sceneEdit,
  type StudioEdit,
  type StudioTextOverlay,
  type StudioState,
} from "@/types/studio";

type Props = {
  state: StudioState;
  projectId: string | null;
  disabled: boolean;
  onAction: (body: object, label?: string) => Promise<StudioState | undefined>;
  onExporting: (value: boolean) => void;
  onError: (message: string) => void;
  onSaveExport: (blob: Blob) => Promise<boolean>;
  mp4Export?: boolean;
  onRenderState?: (state: StudioState) => void;
};
export function FilmAssembly({
  state,
  projectId,
  disabled,
  onAction,
  onExporting,
  onError,
  onSaveExport,
  mp4Export = false,
  onRenderState,
}: Props) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(5);
  const [position, setPosition] = useState(0);
  const [download, setDownload] = useState("");
  const [exportSaved, setExportSaved] = useState(false);
  const [cloudRendering, setCloudRendering] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState("webm");
  const exportBlob = useRef<Blob | null>(null);
  const [edit, setEdit] = useState<StudioEdit>(DEFAULT_STUDIO_EDIT);
  const video = useRef<HTMLVideoElement>(null);
  const voices = useRef<(HTMLAudioElement | null)[]>([]);
  const music = useRef<HTMLAudioElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textPreview = useRef<HTMLCanvasElement>(null);
  const playIntent = useRef(false);
  const recordIntent = useRef(false);
  const advancing = useRef(false);
  const cancelled = useRef(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const graph = useRef<{
    context: AudioContext;
    destination: MediaStreamAudioDestinationNode;
    nodes: Map<
      HTMLMediaElement,
      { source: MediaElementAudioSourceNode; gain: GainNode }
    >;
  } | null>(null);
  const latest = useRef({ state, index, edit });
  latest.current = { state, index, edit };
  const source = (kind: string, sceneId: string, extra = "") =>
    `/api/studio/${projectId}/media?sceneId=${sceneId}&kind=${kind}${extra}`;
  const sceneId = state.timeline[index];
  const scene = state.scenes.find((item) => item.id === sceneId);
  const take = scene?.takes.find((item) => item.id === scene.selectedVideoId);
  const continuityIssue = filmContinuityProblem(state);
  const savedEdit = JSON.stringify(sceneEdit(state, sceneId));
  useEffect(() => {
    setEdit(JSON.parse(savedEdit));
    setPosition(0);
  }, [sceneId, savedEdit]);
  useEffect(() => {
    void document.fonts.load('36px "Studio Caption"').catch(() => {});
  }, []);
  const runningExport = state.renderJobs?.find((job) =>
    ["submitting", "queued", "rendering"].includes(job.status),
  );
  useEffect(() => {
    if (!runningExport || !projectId) {
      setCloudRendering(false);
      return;
    }
    setCloudRendering(true);
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch(
          `/api/studio/${projectId}/render?requestId=${runningExport.requestId}`,
          { cache: "no-store" },
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not check export status.");
        if (!active) return;
        onRenderState?.(data.state);
        if (data.job.status === "complete") {
          setDownload(`/api/studio/${projectId}/media?exportId=${data.job.id}`);
          setDownloadFormat("mp4");
          setExportSaved(true);
          setCloudRendering(false);
          localStorage.removeItem(`omni-film-export:${projectId}`);
          return;
        }
        if (["error", "needs_attention"].includes(data.job.status)) {
          if (data.job.status === "error") localStorage.removeItem(`omni-film-export:${projectId}`);
          setCloudRendering(false);
          onError(data.job.error || "The export failed.");
          return;
        }
      } catch (cause) {
        if (active)
          onError(
            cause instanceof Error
              ? cause.message
              : "Could not check export status.",
          );
      }
      if (active) timer = setTimeout(poll, 5000);
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [runningExport?.requestId, projectId]);
  useEffect(() => {
    return () => {
      cancelled.current = true;
      recordIntent.current = false;
      if (recorder.current && recorder.current.state !== "inactive")
        recorder.current.stop();
      graph.current?.context.close();
      onExporting(false);
    };
    // Parent passes a stable React state setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(
    () => () => {
      if (download.startsWith("blob:")) URL.revokeObjectURL(download);
    },
    [download],
  );
  function initAudio() {
    if (!graph.current) {
      const context = new AudioContext();
      graph.current = {
        context,
        destination: context.createMediaStreamDestination(),
        nodes: new Map(),
      };
    }
    const current = graph.current;
    const attach = (element: HTMLMediaElement | null, volume: number) => {
      if (!element) return;
      let node = current.nodes.get(element);
      if (!node) {
        const source = current.context.createMediaElementSource(element);
        const gain = current.context.createGain();
        source.connect(gain);
        gain.connect(current.context.destination);
        gain.connect(current.destination);
        node = { source, gain };
        current.nodes.set(element, node);
      }
      element.volume = 1;
      node.gain.gain.value = volume;
    };
    const currentEdit = latest.current.edit;
    attach(video.current, currentEdit.videoVolume);
    attach(music.current, currentEdit.musicVolume);
    voices.current.forEach((element) =>
      attach(element, currentEdit.voiceVolume),
    );
    void current.context.resume();
  }
  function pauseAudio() {
    voices.current.forEach((element) => element?.pause());
    music.current?.pause();
  }
  function stop() {
    playIntent.current = false;
    video.current?.pause();
    pauseAudio();
    setPlaying(false);
    if (recorder.current && recorder.current.state !== "inactive")
      recorder.current.stop();
    recordIntent.current = false;
    setRecording(false);
    onExporting(false);
  }
  function advance() {
    if (advancing.current) return;
    advancing.current = true;
    const next = latest.current.index + 1;
    pauseAudio();
    if (next < latest.current.state.timeline.length && playIntent.current)
      setIndex(next);
    else stop();
  }
  function sync() {
    const element = video.current;
    if (!element || element.paused) return;
    const settings = latest.current.edit;
    const elapsed = Math.max(0, element.currentTime - settings.start);
    const align = (
      audio: HTMLAudioElement | null,
      offset: number,
      loop: boolean,
    ) => {
      if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0)
        return;
      if (offset < 0 || (!loop && offset >= audio.duration)) {
        audio.pause();
        return;
      }
      const target = loop ? offset % audio.duration : offset;
      if (Math.abs(audio.currentTime - target) > 0.25)
        audio.currentTime = target;
      if (audio.paused)
        audio.play().catch(() => {
          onError(
            "An audio track could not play. Stop playback and check the source before exporting.",
          );
          stop();
        });
    };
    const currentScene = latest.current.state.scenes.find(
      (item) => item.id === latest.current.state.timeline[latest.current.index],
    );
    let offset = settings.voiceDelay;
    voices.current
      .slice(0, currentScene?.dialogues.length || 0)
      .forEach((audio) => {
        align(audio, elapsed - offset, false);
        if (audio)
          offset += Number.isFinite(audio.duration) ? audio.duration : Infinity;
      });
    align(music.current, elapsed, true);
    setPosition(element.currentTime);
    const end = settings.end || element.duration;
    const fade = Math.min(
      1,
      settings.fadeIn ? elapsed / settings.fadeIn : 1,
      settings.fadeOut
        ? Math.max(0, Math.min(end, element.duration) - element.currentTime) /
            settings.fadeOut
        : 1,
    );
    graph.current?.nodes.forEach((node, media) => {
      node.gain.gain.value =
        fade *
        (media === video.current
          ? settings.videoVolume
          : media === music.current
            ? settings.musicVolume
            : settings.voiceVolume);
    });
    if (element.currentTime >= Math.min(end, element.duration) - 0.035) {
      element.pause();
      advance();
    }
  }
  useEffect(() => {
    let frame: number;
    const captions = (context: CanvasRenderingContext2D) => {
      const elapsed =
        (video.current?.currentTime || 0) - latest.current.edit.start;
      context.save();
      context.textBaseline = "top";
      context.lineJoin = "round";
      context.lineWidth = 4;
      for (const text of latest.current.edit.texts || []) {
        if (elapsed < text.start || (text.end && elapsed > text.end)) continue;
        context.font = `${text.size}px "Studio Caption", sans-serif`;
        context.fillStyle = text.color;
        context.strokeStyle = "black";
        const lines = text.text.split("\n");
        const width = Math.max(
          ...lines.map((line) => context.measureText(line).width),
          0,
        );
        const height = text.size * lines.length;
        lines.forEach((line, at) => {
          const x = (1024 - width) * text.x,
            y = (576 - height) * text.y + at * text.size;
          context.strokeText(line, x, y);
          context.fillText(line, x, y);
        });
      }
      context.restore();
    };
    const draw = () => {
      const preview = textPreview.current?.getContext("2d");
      if (preview) {
        preview.clearRect(0, 0, 1024, 576);
        captions(preview);
      }
      if (
        recordIntent.current &&
        canvas.current &&
        video.current &&
        video.current.readyState >= 2
      ) {
        const context = canvas.current.getContext("2d");
        const width = canvas.current.width,
          height = canvas.current.height;
        context?.fillRect(0, 0, width, height);
        const ratio = Math.min(
          width / video.current.videoWidth,
          height / video.current.videoHeight,
        );
        const w = video.current.videoWidth * ratio,
          h = video.current.videoHeight * ratio;
        context?.drawImage(
          video.current,
          (width - w) / 2,
          (height - h) / 2,
          w,
          h,
        );
        if (context) captions(context);
      }
      sync();
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  });
  useEffect(() => {
    if (graph.current) initAudio();
  }, [edit]);
  async function playFilm() {
    const problem = filmContinuityProblem(latest.current.state);
    if (problem) {
      onError(problem);
      return;
    }
    if (!video.current || !scene) return;
    if (edit.start >= duration || (edit.end && edit.end <= edit.start)) {
      onError("Choose a valid trim range within the clip duration.");
      return;
    }
    initAudio();
    playIntent.current = true;
    setPlaying(true);
    if (
      video.current.currentTime < edit.start ||
      video.current.currentTime >= (edit.end || duration)
    )
      video.current.currentTime = edit.start;
    try {
      await video.current.play();
    } catch {
      onError("The video could not play. Refresh media status and try again.");
      stop();
    }
  }
  async function exportFilm() {
    const problem = filmContinuityProblem(latest.current.state);
    if (problem) {
      onError(problem);
      return;
    }
    if (!canvas.current || !video.current || !scene) return;
    if (mp4Export && projectId) {
      stop();
      setCloudRendering(true);
      try {
        const saved = await onAction({
          action: "edit",
          sceneId: scene.id,
          edit,
        });
        if (!saved) throw new Error("Save your clip edits before exporting.");
        const key = `omni-film-export:${projectId}`;
        const requestId = localStorage.getItem(key) || crypto.randomUUID();
        localStorage.setItem(key, requestId);
        const response = await fetch(`/api/studio/${projectId}/render`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId }),
        });
        const data = await response.json();
        if (!response.ok) {
          if (response.status < 500) localStorage.removeItem(key);
          throw new Error(data.error || "Could not start MP4 export.");
        }
        onRenderState?.(data.state);
        if (data.job.status === "complete") {
          setDownload(`/api/studio/${projectId}/media?exportId=${data.job.id}`);
          setDownloadFormat("mp4");
          setExportSaved(true);
          setCloudRendering(false);
          localStorage.removeItem(key);
        }
      } catch (cause) {
        setCloudRendering(false);
        onError(
          cause instanceof Error
            ? cause.message
            : "Could not start MP4 export.",
        );
      }
      return;
    }
    if (
      !window.MediaRecorder ||
      !canvas.current.captureStream ||
      !window.AudioContext
    ) {
      onError(
        "This browser cannot export a story. Use a recent desktop Chrome or Edge.",
      );
      return;
    }
    const mime = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ].find((value) => MediaRecorder.isTypeSupported(value));
    if (!mime) {
      onError("WebM recording is unavailable in this browser.");
      return;
    }
    stop();
    setIndex(0);
    setDownload("");
    setDownloadFormat("webm");
    setExportSaved(false);
    // Wait until the first clip and all its audio tracks are ready before recording.
    recordIntent.current = true;
    setRecording(true);
    onExporting(true);
    const waitReady = async () => {
      const start = Date.now();
      while (Date.now() - start < 45000) {
        if (cancelled.current || !recordIntent.current)
          throw new Error("Export cancelled.");
        const firstScene = latest.current.state.scenes.find(
          (item) => item.id === latest.current.state.timeline[0],
        );
        const audioReady =
          voices.current
            .slice(0, firstScene?.dialogues.length || 0)
            .every((element) => !element || element.readyState >= 2) &&
          (!firstScene?.musicUrl || (music.current?.readyState || 0) >= 2);
        if (
          latest.current.index === 0 &&
          (video.current?.readyState || 0) >= 2 &&
          audioReady
        )
          return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(
        "Media took too long to load. Preview the story once, then retry export.",
      );
    };
    try {
      await waitReady();
      const firstId = latest.current.state.timeline[0];
      const firstEdit = sceneEdit(latest.current.state, firstId);
      video.current.currentTime = firstEdit.start;
      initAudio();
      const visual = canvas.current.captureStream(24);
      const stream = new MediaStream([
        ...visual.getVideoTracks(),
        ...graph.current!.destination.stream.getAudioTracks(),
      ]);
      const recording = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 3500000,
      });
      recorder.current = recording;
      const parts: Blob[] = [];
      recording.ondataavailable = (event) => {
        if (event.data.size) parts.push(event.data);
      };
      recording.onstop = () => {
        const blob = new Blob(parts, { type: "video/webm" });
        exportBlob.current = blob;
        if (blob.size) setDownload(URL.createObjectURL(blob));
        visual.getTracks().forEach((track) => track.stop());
        setRecording(false);
        onExporting(false);
      };
      recording.onerror = () => {
        onError("Export failed. Please try again.");
        stop();
      };
      recording.start(1000);
      playIntent.current = true;
      setPlaying(true);
      await video.current.play();
    } catch (cause) {
      onError(
        cause instanceof Error ? cause.message : "Could not export story.",
      );
      stop();
    }
  }
  function reorder(at: number, direction: number) {
    const ordered = [...state.timeline];
    const target = at + direction;
    if (target < 0 || target >= ordered.length) return;
    [ordered[at], ordered[target]] = [ordered[target], ordered[at]];
    void onAction({ action: "timeline", sceneIds: ordered });
  }
  const available = state.scenes.filter(
    (item) => !state.timeline.includes(item.id) && item.selectedVideoId,
  );
  if (!scene || !take)
    return (
      <div className="studio-assembly">
        <h2>Bring your story together.</h2>
        <div className="studio-empty">
          Choose a completed take in Scenes and select{" "}
          <strong>Add to story</strong>.<br />
          Your clips will appear here, ready to arrange and mix.
        </div>
        {available.map((item) => (
          <button
            key={item.id}
            className="studio-btn"
            disabled={disabled}
            onClick={() =>
              void onAction({
                action: "timeline",
                sceneIds: [...state.timeline, item.id],
              })
            }
          >
            <Plus />
            {item.title}
          </button>
        ))}
        {!!state.exports?.length && (
          <details style={{ marginTop: 18 }}>
            <summary className="studio-muted">
              Saved exports ({state.exports.length})
            </summary>
            {state.exports.map((item) => (
              <p key={item.id}>
                <a
                  className="studio-export-link"
                  href={`/api/studio/${projectId}/media?exportId=${item.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.name}
                </a>
              </p>
            ))}
          </details>
        )}
      </div>
    );
  const numeric = (key: "start" | "end" | "voiceDelay", label: string) => (
    <label>
      {label}
      <input
        type="number"
        min={0}
        max={duration}
        step={0.1}
        value={edit[key]}
        disabled={playing}
        onChange={(event) =>
          setEdit((current) => ({
            ...current,
            [key]: Math.max(0, Number(event.target.value) || 0),
          }))
        }
      />
    </label>
  );
  const updateText = (at: number, patch: Partial<StudioTextOverlay>) =>
    setEdit((current) => ({
      ...current,
      texts: (current.texts || []).map((text, index) =>
        index === at ? { ...text, ...patch } : text,
      ),
    }));
  return (
    <section className="studio-assembly">
      <div
        className="studio-row"
        style={{ justifyContent: "space-between", marginBottom: 14 }}
      >
        <h2 style={{ margin: 0 }}>Your story</h2>
        <button
          className="studio-btn primary"
          disabled={disabled || playing || cloudRendering || !!continuityIssue}
          onClick={() => void exportFilm()}
        >
          <Download />
          {cloudRendering
            ? "Exporting…"
            : mp4Export
              ? "Export MP4"
              : "Export story"}
        </button>
      </div>
      <div className="studio-film-preview">
        <video
          ref={video}
          playsInline
          preload="auto"
          src={source("take", scene.id, `&takeId=${take.id}`)}
          onLoadedMetadata={() => {
            advancing.current = false;
            const element = video.current!;
            setDuration(
              Number.isFinite(element.duration) ? element.duration : 5,
            );
            const settings = sceneEdit(latest.current.state, scene.id);
            if (settings.start >= element.duration) {
              onError(
                "A saved trim starts beyond the end of this clip. Adjust the trim before playing.",
              );
              stop();
              return;
            }
            element.currentTime = settings.start;
            if (playIntent.current) {
              initAudio();
              element.play().catch(() => {
                onError("A timeline clip could not play.");
                stop();
              });
            }
          }}
          onWaiting={() => {
            pauseAudio();
            if (recorder.current?.state === "recording")
              recorder.current.pause();
          }}
          onPlaying={() => {
            if (recorder.current?.state === "paused") recorder.current.resume();
          }}
          onEnded={advance}
          onError={() => {
            onError(
              "A clip could not load. Use Refresh media status in Scenes before trying again.",
            );
            stop();
          }}
        />
        <canvas
          ref={textPreview}
          width={1024}
          height={576}
          aria-hidden="true"
          className="studio-text-preview"
        />
      </div>
      {continuityIssue && (
        <p className="studio-continuity" data-status="review" role="alert">
          {continuityIssue} Open Scenes to review or regenerate the take.
        </p>
      )}
      <canvas ref={canvas} width={1024} height={576} />
      <div
        className="studio-row"
        style={{ marginTop: 12, justifyContent: "space-between" }}
      >
        <button
          className="studio-btn"
          onClick={() => (playing ? stop() : void playFilm())}
          disabled={disabled || (!playing && !!continuityIssue)}
        >
          {playing ? <Square /> : <Play />}
          {playing ? (recording ? "Stop export" : "Stop") : "Preview full story"}
        </button>
        <span className="studio-muted">
          Scene {index + 1} of {state.timeline.length} · {position.toFixed(1)} /{" "}
          {duration.toFixed(1)} sec
        </span>
      </div>
      {recording && (
        <p className="studio-export-progress" role="status">
          Rendering your story with audio in real time. Keep this tab open. Scene{" "}
          {index + 1} of {state.timeline.length}.
        </p>
      )}
      {cloudRendering && (
        <p className="studio-export-progress" role="status">
          Preparing your MP4. You can leave this page; the export stays with
          your project.
        </p>
      )}
      {download && !continuityIssue && (
        <div style={{ marginTop: 12 }}>
          <a
            className="studio-export-link"
            href={download}
            download={`${state.title.replace(/[^a-z0-9_-]/gi, "-")}.${downloadFormat}`}
          >
            Download edited story (.{downloadFormat})
          </a>
          <p className="studio-muted">
            Includes clip audio, trims and text.{" "}
            {downloadFormat === "mp4"
              ? "Saved to your project."
              : "Download or save before leaving."}
          </p>
          {downloadFormat !== "mp4" && (
            <button
              className="studio-btn"
              style={{ marginTop: 10 }}
              disabled={disabled || exportSaved}
              onClick={async () => {
                if (
                  exportBlob.current &&
                  (await onSaveExport(exportBlob.current))
                )
                  setExportSaved(true);
              }}
            >
              {exportSaved ? "Export saved" : "Save export to project"}
            </button>
          )}
        </div>
      )}
      {!!state.exports?.length && (
        <details style={{ marginTop: 18 }}>
          <summary className="studio-muted">
            Saved exports ({state.exports.length})
          </summary>
          {state.exports.map((item) => (
            <p key={item.id}>
              <a
                className="studio-export-link"
                href={`/api/studio/${projectId}/media?exportId=${item.id}`}
                target="_blank"
                rel="noreferrer"
              >
                {item.name}
              </a>
              <span className="studio-muted">
                {" "}
                · {new Date(item.createdAt).toLocaleDateString()}
              </span>
            </p>
          ))}
        </details>
      )}
      <div className="studio-timeline" aria-label="Story timeline">
        {state.timeline.map((id, at) => (
          <div
            key={id}
            className={`studio-timeline-clip ${at === index ? "active" : ""}`}
          >
            <button disabled={playing || disabled} onClick={() => setIndex(at)}>
              <p>
                {at + 1}. {state.scenes.find((item) => item.id === id)?.title}
              </p>
            </button>
            <div className="studio-row">
              <button
                className="studio-icon"
                aria-label="Move clip earlier"
                disabled={playing || disabled || at === 0}
                onClick={() => reorder(at, -1)}
              >
                <ArrowLeft />
              </button>
              <button
                className="studio-icon"
                aria-label="Move clip later"
                disabled={
                  playing || disabled || at === state.timeline.length - 1
                }
                onClick={() => reorder(at, 1)}
              >
                <ArrowRight />
              </button>
              <button
                className="studio-icon"
                aria-label="Remove clip from story"
                disabled={playing || disabled}
                onClick={() => {
                  setIndex(0);
                  void onAction({
                    action: "timeline",
                    sceneIds: state.timeline.filter((item) => item !== id),
                  });
                }}
              >
                <X />
              </button>
            </div>
          </div>
        ))}
      </div>
      <h3 style={{ fontWeight: 600 }}>Edit: {scene.title}</h3>
      {state.undoEdits && (
        <button
          className="studio-btn"
          disabled={disabled || playing}
          onClick={() => void onAction({ action: "undoEdits" })}
        >
          Undo last edit
        </button>
      )}
      <div className="studio-mix">
        {numeric("start", "Trim start (sec)")}
        {numeric("end", "Trim end (0 = full clip)")}
        {!take.nativeAudio && numeric("voiceDelay", "Dialogue delay (sec)")}
        {(
          [
            ["voiceVolume", "Dialogue"],
            ["musicVolume", "Background music"],
            ["videoVolume", "Original video audio"],
          ] as const
        )
          .filter(([key]) => !take.nativeAudio || key === "videoVolume")
          .map(([key, label]) => (
            <label key={key}>
              {take.nativeAudio ? "Clip audio" : label} ·{" "}
              {Math.round(edit[key] * 100)}%
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                disabled={recording}
                value={edit[key]}
                onChange={(event) =>
                  setEdit((current) => ({
                    ...current,
                    [key]: Number(event.target.value),
                  }))
                }
              />
            </label>
          ))}
      </div>
      <div className="studio-mix">
        {(["fadeIn", "fadeOut"] as const).map((key) => (
          <label key={key}>
            {key === "fadeIn" ? "Audio fade in (sec)" : "Audio fade out (sec)"}
            <input
              type="number"
              min={0}
              max={5}
              step={0.1}
              value={edit[key] || 0}
              disabled={playing}
              onChange={(event) =>
                setEdit((current) => ({
                  ...current,
                  [key]: Math.min(
                    5,
                    Math.max(0, Number(event.target.value) || 0),
                  ),
                }))
              }
            />
          </label>
        ))}
      </div>
      <details className="studio-overlay-controls">
        <summary>
          Text on this clip{edit.texts?.length ? ` (${edit.texts.length})` : ""}
        </summary>
        {(edit.texts || []).map((text, at) => (
          <div className="studio-caption-editor" key={at}>
            <label>
              Text
              <textarea
                aria-label="Caption text"
                maxLength={500}
                value={text.text}
                disabled={playing}
                onChange={(event) =>
                  updateText(at, { text: event.target.value })
                }
              />
            </label>
            <div className="studio-mix">
              <label>
                Vertical position
                <select
                  value={text.y}
                  disabled={playing}
                  onChange={(event) =>
                    updateText(at, { y: Number(event.target.value) })
                  }
                >
                  <option value={0.08}>Top</option>
                  <option value={0.5}>Center</option>
                  <option value={0.9}>Bottom</option>
                </select>
              </label>
              <label>
                Horizontal position
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={text.x}
                  disabled={playing}
                  onChange={(event) =>
                    updateText(at, { x: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                Size
                <input
                  type="number"
                  min={16}
                  max={96}
                  value={text.size}
                  disabled={playing}
                  onChange={(event) =>
                    updateText(at, {
                      size: Math.min(
                        96,
                        Math.max(16, Number(event.target.value) || 36),
                      ),
                    })
                  }
                />
              </label>
              <label>
                Color
                <input
                  type="color"
                  value={text.color}
                  disabled={playing}
                  onChange={(event) =>
                    updateText(at, { color: event.target.value })
                  }
                />
              </label>
              <label>
                Show from (sec)
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, (edit.end || duration) - edit.start)}
                  step={0.1}
                  value={text.start}
                  disabled={playing}
                  onChange={(event) =>
                    updateText(at, {
                      start: Math.max(0, Number(event.target.value) || 0),
                    })
                  }
                />
              </label>
              <label>
                Hide at (0 = clip end)
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, (edit.end || duration) - edit.start)}
                  step={0.1}
                  value={text.end}
                  disabled={playing}
                  onChange={(event) =>
                    updateText(at, {
                      end: Math.max(0, Number(event.target.value) || 0),
                    })
                  }
                />
              </label>
            </div>
            <button
              className="studio-btn"
              disabled={playing}
              onClick={() =>
                setEdit((current) => ({
                  ...current,
                  texts: current.texts?.filter((_, index) => index !== at),
                }))
              }
            >
              Remove text
            </button>
          </div>
        ))}
        <button
          className="studio-btn"
          disabled={playing || (edit.texts?.length || 0) >= 8}
          onClick={() =>
            setEdit((current) => ({
              ...current,
              texts: [
                ...(current.texts || []),
                {
                  text: "Your text",
                  x: 0.5,
                  y: 0.9,
                  size: 36,
                  color: "#ffffff",
                  start: 0,
                  end: 0,
                },
              ],
            }))
          }
        >
          <Plus />
          Add text
        </button>
      </details>
      <button
        className="studio-btn primary"
        disabled={
          disabled ||
          playing ||
          (edit.texts || []).some(
            (text) => !!text.end && text.end <= text.start,
          ) ||
          edit.start >= duration ||
          (!!edit.end && (edit.end <= edit.start || edit.end > duration))
        }
        onClick={() =>
          void onAction({ action: "edit", sceneId: scene.id, edit })
        }
      >
        Save clip edits
      </button>
      <p className="studio-muted" style={{ marginTop: 12 }}>
        Text timing starts at the trimmed clip’s beginning.{" "}
        {mp4Export
          ? "MP4 exports preserve your audio, fades and text."
          : "Browser exports record the preview in real time."}
      </p>
      {available.length > 0 && (
        <details style={{ marginTop: 20 }}>
          <summary className="studio-muted">Add another selected scene</summary>
          <div className="studio-row" style={{ marginTop: 12 }}>
            {available.map((item) => (
              <button
                key={item.id}
                className="studio-btn"
                disabled={disabled || playing}
                onClick={() =>
                  void onAction({
                    action: "timeline",
                    sceneIds: [...state.timeline, item.id],
                  })
                }
              >
                <Plus />
                {item.title}
              </button>
            ))}
          </div>
        </details>
      )}
      {!take.nativeAudio &&
        scene.dialogues.map((line, at) =>
          line.audioUrl ? (
            <audio
              key={`${scene.id}:${at}`}
              ref={(element) => {
                voices.current[at] = element;
              }}
              preload="auto"
              src={source("voice", scene.id, `&index=${at}`)}
              onLoadedData={() => {
                if (graph.current) initAudio();
              }}
            />
          ) : (
            <span
              key={`${scene.id}:${at}`}
              ref={() => {
                voices.current[at] = null;
              }}
            />
          ),
        )}
      {!take.nativeAudio && (
        <audio
          ref={music}
          preload="auto"
          loop
          src={scene.musicUrl ? source("music", scene.id) : undefined}
          onLoadedData={() => {
            if (graph.current) initAudio();
          }}
        />
      )}
    </section>
  );
}
