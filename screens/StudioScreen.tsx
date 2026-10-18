"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp, Check, ChevronDown, ChevronRight, Clapperboard, FileText, Folder, Lightbulb, Loader2, LogOut, MoreHorizontal, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Paperclip, Plus, Users, X } from "lucide-react";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/context/AuthContext";
import {
  EMPTY_STUDIO,
  type StudioCharacter,
  type StudioProject,
  type StudioScene,
  type StudioState,
  type StudioTab,
} from "@/types/studio";
import { FilmAssembly } from "@/components/studio/film-assembly";
import { DirectorTools } from "@/components/studio/director-tools";
import { ContinuityCheck } from "@/components/studio/continuity-check";
import { PublicBrand } from "@/components/public/public-shell";
import {
  SceneQueue,
  type SceneQueueHandle,
} from "@/components/studio/scene-queue";
import type { SceneThread } from "@/types/studio";
import { characterReferences, continuityProblem } from "@/lib/studio/identity";
import {
  readStudioEntry,
  linkStudioEntry,
  removeStudioEntry,
  type StudioEntry,
} from "@/lib/studio/entry";
const needsUpdate = (take: import("@/types/studio").StudioTake) =>
  ["queued", "rendering"].includes(take.status) ||
  (take.status === "complete" &&
    (!take.url || take.continuity?.status === "pending"));
const editLabels: Record<string, string> = {
  start: "Trim start",
  end: "Trim end",
  voiceDelay: "Dialogue delay",
  voiceVolume: "Dialogue volume",
  musicVolume: "Music volume",
  videoVolume: "Original audio",
  fadeIn: "Audio fade in",
  fadeOut: "Audio fade out",
};

const starters = [
  {
    mode: "discover",
    title: "Help me find an idea",
    text: "I don't have a clear idea yet. Help me discover one and develop it into a story.",
    description: "Explore a few directions, then build something together.",
    icon: Lightbulb,
  },
  {
    mode: "develop",
    title: "Develop my idea",
    text: "I have an idea. Help me explore it and turn it into a complete story.",
    description: "Bring your idea, a script, or a character reference.",
    icon: FileText,
  },
] as const;
export default function StudioScreen() {
  return (
    <ProtectedRoute>
      <Workspace />
    </ProtectedRoute>
  );
}
function Workspace() {
  const { currentUser, logout } = useAuth();
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [capabilities, setCapabilities] = useState({ nativeVideo: false, mp4Export: false });
  const [projectId, setProjectId] = useState<string | null>(null);
  const [state, setState] = useState<StudioState>(
    structuredClone(EMPTY_STUDIO),
  );
  const [tab, setTab] = useState<StudioTab>("plan");
  const [selectedScene, setSelectedScene] = useState("");
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(true);
  const [detail, setDetail] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [characterName, setCharacterName] = useState("");
  const [referenceView, setReferenceView] = useState("Front");
  const [file, setFile] = useState<File | null>(null);
  const [adjust, setAdjust] = useState(false);
  const [direct, setDirect] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sceneThread, setSceneThread] = useState<SceneThread | null>(null);
  const [sceneSubmitting, setSceneSubmitting] = useState(false);
  const sceneSubmittingRef = useRef(false);
  const sceneQueue = useRef<SceneQueueHandle>(null);
  const activeId = useRef<string | null>(null);
  const busyRef = useRef(false);
  const entryStarted = useRef(false);
  const entryRef = useRef<(StudioEntry & { id: string }) | null>(null);
  const endOfChat = useRef<HTMLDivElement>(null);
  const scene =
    state.scenes.find((item) => item.id === selectedScene) || state.scenes[0];
  const selectedImage = scene?.takes.find(
    (take) => take.id === scene.selectedImageId,
  );
  const needsSceneImage =
    !!scene?.characterIds.length &&
    (!selectedImage || !!continuityProblem(state, scene, selectedImage));
  const prefKey = `omni-studio-panels:${currentUser?.id}`;

  const receive = useCallback(async (response: Response) => {
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "The request failed. Please try again.");
    return data;
  }, []);
  const loadProjects = useCallback(async () => {
    const data = await receive(
      await fetch("/api/studio", { cache: "no-store" }),
    );
    setProjects(data.projects);
    if (data.capabilities) setCapabilities(data.capabilities);
  }, [receive]);
  const openProject = useCallback(
    async (id: string, restoringEntry = false) => {
      if (busyRef.current || sceneSubmittingRef.current) return;
      busyRef.current = true;
      setBusy("Opening project");
      setError("");
      try {
        const data = await receive(
          await fetch(`/api/studio/${id}`, { cache: "no-store" }),
        );
        if (entryRef.current && !restoringEntry) {
          removeStudioEntry(entryRef.current.id);
          entryRef.current = null;
          setText("");
        }
        activeId.current = id;
        setProjectId(id);
        setState(data.state);
        setSelectedScene(data.state.scenes[0]?.id || "");
        setTab("plan");
        setSceneThread(null);
        setDetail(null);
        window.history.replaceState(
          null,
          "",
          `/studio?project=${id}${entryRef.current ? `&start=${entryRef.current.id}` : ""}`,
        );
        return data.state as StudioState;
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Could not open project.",
        );
      } finally {
        busyRef.current = false;
        setBusy("");
      }
    },
    [receive],
  );
  useEffect(() => {
    loadProjects().catch((cause) => setError(cause.message));
    const params = new URLSearchParams(window.location.search);
    const id = params.get("project");
    if (id && !params.has("start")) void openProject(id);
  }, [loadProjects, openProject]);
  useEffect(() => {
    try {
      const panels = JSON.parse(localStorage.getItem(prefKey) || "null");
      if (panels) {
        setLeftOpen(!!panels.left);
        setRightOpen(!!panels.right);
      } else if (window.innerWidth < 760) setRightOpen(false);
    } catch {
      /* Defaults work when storage is unavailable. */
    }
  }, [prefKey]);
  function setPanels(left: boolean, right: boolean) {
    setLeftOpen(left);
    setRightOpen(right);
    try {
      localStorage.setItem(prefKey, JSON.stringify({ left, right }));
    } catch {
      /* Only layout preferences are stored locally. */
    }
  }
  useEffect(() => {
    endOfChat.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state.messages.length, busy]);
  async function ensureProject() {
    if (activeId.current) return activeId.current;
    const data = await receive(await fetch("/api/studio", { method: "POST" }));
    activeId.current = data.id;
    setProjectId(data.id);
    window.history.replaceState(
      null,
      "",
      `/studio?project=${data.id}${entryRef.current ? `&start=${entryRef.current.id}` : ""}`,
    );
    if (entryRef.current) {
      entryRef.current.projectId = data.id;
      linkStudioEntry(entryRef.current.id, data.id);
    }
    return data.id as string;
  }
  function finishEntry(id: string) {
    if (entryRef.current) removeStudioEntry(entryRef.current.id);
    entryRef.current = null;
    window.history.replaceState(null, "", `/studio?project=${id}`);
  }
  const action = useCallback(
    async (body: object, label = "Saving") => {
      if (busyRef.current) return undefined;
      busyRef.current = true;
      setBusy(label);
      setError("");
      setSaved(false);
      try {
        const id = await ensureProject();
        const data = await receive(
          await fetch(`/api/studio/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (activeId.current === id) {
          setState(data.state);
          setSaved(true);
          if (
            entryRef.current &&
            "action" in body &&
            body.action === "chat" &&
            "text" in body &&
            body.text === entryRef.current.text
          )
            finishEntry(id);
        }
        void loadProjects().catch(() => {});
        return data.state as StudioState;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to save.");
        return undefined;
      } finally {
        busyRef.current = false;
        setBusy("");
      }
      // ensureProject reads the current project ref, not render-time state.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [receive, loadProjects],
  );
  async function restoreGuest(
    id?: string,
    targetTab: StudioTab = "plan",
    pendingText?: string,
  ) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy("Opening your conversation");
    let restored: string | undefined;
    try {
      const data = await receive(
        await fetch("/api/studio/guest/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(id ? { id } : {}),
        }),
      );
      if (data.id) {
        restored = data.id;
        activeId.current = data.id;
        setProjectId(data.id);
        setState(data.state);
        setSelectedScene(data.state.scenes[0]?.id || "");
        setTab(targetTab);
        finishEntry(data.id);
        setText(pendingText || "");
        void loadProjects().catch(() => {});
      } else if (id)
        setError(
          "This trial has expired. Your last message is still here to start a new conversation.",
        );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not recover your conversation.",
      );
    } finally {
      busyRef.current = false;
      setBusy("");
    }
    if (restored && pendingText) {
      const result = await action(
        { action: "chat", text: pendingText, tab: targetTab },
        "Your director is thinking",
      );
      if (result)
        setText((current) => (current === pendingText ? "" : current));
    }
  }
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("start");
    if (entryStarted.current) return;
    entryStarted.current = true;
    if (!id) {
      if (!params.has("project")) void restoreGuest();
      return;
    }
    let entry: StudioEntry | null = null;
    try {
      entry = readStudioEntry(id);
    } catch {
      /* Storage may be disabled. */
    }
    if (!entry) {
      setError(
        "That saved message has expired or isn't available in this browser. Write your idea below to start a conversation.",
      );
      window.history.replaceState(null, "", "/studio");
      return;
    }
    entryRef.current = { ...entry, id };
    const message = entry.text;
    setText(message);
    if (entry.guestProjectId) {
      void restoreGuest(entry.guestProjectId, entry.tab, entry.pendingText);
      return;
    }
    void (async () => {
      if (entry.projectId) {
        const existing = await openProject(entry.projectId, true);
        if (!existing) return;
        // A previous response may have succeeded just before the tab reloaded.
        if (
          existing.messages.some(
            (item) => item.role === "user" && item.text === message,
          )
        ) {
          finishEntry(entry.projectId);
          setText((current) => (current === message ? "" : current));
          return;
        }
      }
      const result = await action(
        { action: "chat", text: message, tab: "plan", mode: "develop" },
        "Your director is thinking",
      );
      if (result) setText((current) => (current === message ? "" : current));
      // On failure the message stays in the composer for an explicit retry.
    })();
  }, [action, openProject]);
  const pending =
    state.messages.some(
      (message) => message.image && needsUpdate(message.image),
    ) || state.scenes.some((item) => item.takes.some(needsUpdate));
  useEffect(() => {
    if (!pending || !projectId || error) return;
    const timer = setInterval(() => {
      if (!busyRef.current)
        void action({ action: "poll" }, "Checking generation");
    }, 8000);
    return () => clearInterval(timer);
  }, [pending, projectId, action, error]);
  function newProject() {
    if (busyRef.current || exporting || sceneSubmittingRef.current) return;
    if (entryRef.current) removeStudioEntry(entryRef.current.id);
    entryRef.current = null;
    activeId.current = null;
    setProjectId(null);
    setState(structuredClone(EMPTY_STUDIO));
    setSceneThread(null);
    setTab("plan");
    setSelectedScene("");
    setText("");
    setDetail(null);
    setError("");
    setSaved(false);
    setUploadOpen(false);
    setFile(null);
    window.history.replaceState(null, "", "/studio");
  }
  async function send(value = text, mode?: "discover" | "develop") {
    if (!value.trim()) return;
    const genericImage =
      !sceneThread &&
      /\b(image|photo|portrait|picture|illustration)\b/i.test(value) &&
      !/\bscene\b/i.test(value);
    if (tab === "scenes" && !genericImage) {
      const accepted = await sceneQueue.current?.submit(value.trim());
      if (accepted) setText((current) => (current === value ? "" : current));
      return;
    }
    const result = await action(
      { action: "chat", text: value.trim(), tab, mode, sceneId: scene?.id },
      "Your director is thinking",
    );
    if (result) setText((current) => (current === value ? "" : current));
  }
  async function attach() {
    if (!file || busyRef.current) return;
    if (
      file.type === "text/plain" ||
      file.name.endsWith(".txt") ||
      file.name.endsWith(".md")
    ) {
      if (file.size > 100000) {
        setError("Choose a text file smaller than 100 KB.");
        return;
      }
      const content = await file.text();
      const combined = `${text}\n\n${file.name}:\n${content}`;
      if (combined.length > 24000) {
        setError(
          "This script exceeds the 24,000-character message limit. Attach a shorter section so no material is lost.",
        );
        return;
      }
      setText(combined);
      setFile(null);
      setUploadOpen(false);
      return;
    }
    if (!characterName.trim()) {
      setError(
        "Give the character a name so the director can retrieve it later.",
      );
      return;
    }
    await saveCharacterReference(file, characterName);
  }
  async function saveCharacterReference(source: File | string, name: string) {
    if (busyRef.current || exporting || !name.trim()) return;
    busyRef.current = true;
    setBusy("Reading the character reference");
    setError("");
    try {
      const id = await ensureProject();
      let image: File;
      if (typeof source === "string") {
        const response = await fetch(
          `/api/studio/${id}/media?messageId=${encodeURIComponent(source)}`,
        );
        if (!response.ok)
          throw new Error(
            "The generated image is unavailable. Refresh its status and try again.",
          );
        const blob = await response.blob();
        image = new File([blob], "character-reference", { type: blob.type });
      } else image = source;
      const form = new FormData();
      form.append("file", image);
      form.append("name", name.trim());
      form.append(
        "view",
        typeof source === "string" ? "Generated portrait" : referenceView,
      );
      const data = await receive(
        await fetch(`/api/studio/${id}/reference`, {
          method: "POST",
          body: form,
        }),
      );
      setState(data.state);
      setFile(null);
      setUploadOpen(false);
      setDetail("characters");
      setPanels(leftOpen, true);
      setSaved(true);
      void loadProjects();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Reference upload failed.",
      );
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }
  async function addToFilm(sceneId: string, takeId: string) {
    const selected = await action({ action: "select", sceneId, takeId });
    if (!selected) return;
    if (!selected.timeline.includes(sceneId))
      await action({
        action: "timeline",
        sceneIds: [...selected.timeline, sceneId],
      });
  }
  async function saveExport(blob: Blob) {
    const id = activeId.current;
    if (!id || busyRef.current) return false;
    busyRef.current = true;
    setBusy("Saving your film");
    setError("");
    try {
      const form = new FormData();
      form.append("file", blob, "film.webm");
      const data = await receive(
        await fetch(`/api/studio/${id}/export`, { method: "POST", body: form }),
      );
      if (activeId.current === id) {
        setState(data.state);
        setSaved(true);
      }
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save the export. Download your local copy.",
      );
      return false;
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }
  function switchTab(value: StudioTab) {
    if (exporting) return;
    setTab(value);
    setDetail(null);
    setAdjust(false);
    if (value === "assemble") setPanels(leftOpen, false);
  }
  const label =
    tab === "plan"
      ? "Your story starts with a conversation"
      : tab === "scenes"
        ? scene
          ? `Working on: Scene ${state.scenes.indexOf(scene) + 1} — ${scene.title}`
          : "Approve a plan to begin directing scenes"
        : "Your film, one scene at a time";
  const readyCount = state.scenes.filter((item) =>
    item.takes.some(
      (take) => take.kind === "video" && take.status === "complete",
    ),
  ).length;
  return (
    <div className="film-studio">
      <header className="studio-top">
        <div className="studio-brand">
          <PublicBrand />
          <span className="studio-project-title">{state.title}</span>
        </div>
        <nav className="studio-tabs" role="tablist" aria-label="Film workspace">
          {(["plan", "scenes", "assemble"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => switchTab(value)}
              disabled={exporting}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </nav>
        <span className="studio-avatar" title={currentUser?.name}>
          {currentUser?.name?.[0] || "U"}
        </span>
      </header>
      <div className="studio-body">
        <aside
          className={`studio-left ${leftOpen ? "" : "collapsed"}`}
          aria-label="Projects"
        >
          <div className="studio-left-head">
            {leftOpen && <span className="studio-caption">Workspace</span>}
            <button
              className="studio-icon"
              aria-label={leftOpen ? "Collapse projects" : "Expand projects"}
              aria-expanded={leftOpen}
              onClick={() => setPanels(!leftOpen, rightOpen)}
            >
              {leftOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
            </button>
          </div>
          <button
            className={leftOpen ? "studio-new" : "studio-icon"}
            title="New project"
            aria-label="New project"
            disabled={!!busy || exporting}
            onClick={newProject}
          >
            <Plus />
            {leftOpen && "New project"}
          </button>
          {leftOpen ? (
            <div className="studio-project-list">
              <span className="studio-caption">Your projects</span>
              {projects.map((project) => (
                <button
                  key={project.id}
                  className={`studio-project-item ${projectId === project.id ? "active" : ""}`}
                  disabled={!!busy || exporting}
                  onClick={() => void openProject(project.id)}
                >
                  <Clapperboard />
                  <span>{project.title}</span>
                </button>
              ))}
              {!projects.length && (
                <p className="studio-muted">Your films will appear here.</p>
              )}
            </div>
          ) : (
            <button
              className="studio-icon"
              aria-label="Browse projects"
              onClick={() => setPanels(true, rightOpen)}
            >
              <Folder />
            </button>
          )}
          <div className="studio-left-bottom">
            <span className="studio-avatar" title={currentUser?.name}>
              {currentUser?.name?.[0] || "U"}
            </span>
            {leftOpen && (
              <>
                <span className="studio-muted">{currentUser?.name}</span>
                <button
                  className="studio-icon"
                  aria-label="Sign out"
                  onClick={() =>
                    void logout().then(() => window.location.assign("/auth"))
                  }
                >
                  <LogOut />
                </button>
              </>
            )}
          </div>
        </aside>
        <main className="studio-main">
          <div className="studio-context">
            <span>{label}</span>
            {projectId && (
              <button
                className="studio-icon"
                title={
                  tab === "scenes" ? "Refresh media status" : "Reload project"
                }
                aria-label={
                  tab === "scenes" ? "Refresh media status" : "Reload project"
                }
                disabled={!!busy || exporting}
                onClick={() =>
                  tab === "scenes"
                    ? void action({ action: "poll" }, "Refreshing media")
                    : void openProject(projectId)
                }
              >
                <Folder />
              </button>
            )}
          </div>
          {error && (
            <div role="alert" className="studio-error">
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          <div className="studio-scroll">
            <div className={tab === "assemble" ? "" : "studio-chat"}>
              {tab === "plan" && !state.messages.length && (
                <div className="studio-welcome">
                  <h1>
                    A little idea.
                    <br />A whole new world.
                  </h1>
                  <p>
                    From idea to film. Start with a conversation.
                  </p>
                  <div className="studio-starters">
                    {starters.map((item) => (
                      <button
                        key={item.mode}
                        className="studio-starter"
                        disabled={!!busy}
                        onClick={() => void send(item.text, item.mode)}
                      >
                        <item.icon />
                        <div>
                          <strong>{item.title}</strong>
                          <p>{item.description}</p>
                        </div>
                        <ChevronRight
                          style={{ marginLeft: "auto", color: "#a7a7a7" }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {tab !== "assemble" &&
                state.messages
                  .filter((message) => message.tab === tab)
                  .map((message) => (
                    <article
                      className={`studio-message ${message.role}`}
                      key={message.id}
                    >
                      <div
                        className={
                          message.role === "assistant"
                            ? "studio-message-content"
                            : ""
                        }
                      >
                        <div className="studio-message-text">
                          {message.text}
                        </div>
                        <DirectorTools
                          message={message}
                          projectId={projectId}
                          disabled={!!busy || exporting}
                          onChoose={(value) => void send(value)}
                          onRetry={() =>
                            void action(
                              {
                                action: "generateChatImage",
                                messageId: message.id,
                              },
                              "Starting your image",
                            )
                          }
                          onRefresh={() =>
                            void action(
                              { action: "poll" },
                              "Checking image status",
                            )
                          }
                          onSaveReference={(name) =>
                            void saveCharacterReference(message.id, name)
                          }
                          onReview={() =>
                            void action(
                              {
                                action: "reviewChatImage",
                                messageId: message.id,
                              },
                              "Checking character appearance",
                            )
                          }
                        />
                        {message.plan && (
                          <div className="studio-plan-card">
                            <span className="studio-caption">
                              Proposed story
                            </span>
                            <h3>{message.plan.title}</h3>
                            <p>{message.plan.premise}</p>
                            <ol>
                              {message.plan.scenes.map((item, index) => (
                                <li key={index}>{item.title}</li>
                              ))}
                            </ol>
                            <details>
                              <summary
                                className="studio-muted"
                                style={{ cursor: "pointer" }}
                              >
                                Read the full plan
                              </summary>
                              <p>{message.plan.world}</p>
                              {message.plan.characters.map((item, index) => (
                                <p key={index}>
                                  <strong>{item.name}</strong> ·{" "}
                                  {item.appearance}
                                </p>
                              ))}
                              {message.plan.scenes.map((item, index) => (
                                <p key={index}>
                                  <strong>{item.title}</strong>
                                  <br />
                                  {item.description}
                                  <br />
                                  {item.dialogues
                                    .map(
                                      (line) =>
                                        `${line.character}: ${line.text}`,
                                    )
                                    .join("\n")}
                                </p>
                              ))}
                            </details>
                            <button
                              className={`studio-btn ${message.approved ? "" : "primary"}`}
                              style={{ marginTop: 16 }}
                              disabled={!!busy || message.approved}
                              onClick={() =>
                                void action({
                                  action: "approve",
                                  messageId: message.id,
                                })
                              }
                            >
                              {message.approved ? (
                                <>
                                  <Check /> Approved
                                </>
                              ) : (
                                <>
                                  Use this plan <ArrowRight />
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
              {tab === "scenes" && (
                <SceneQueue
                  key={projectId || "new"}
                  ref={sceneQueue}
                  projectId={projectId}
                  state={state}
                  sceneId={scene?.id || ""}
                  thread={sceneThread}
                  onThread={setSceneThread}
                  onScene={setSelectedScene}
                  onDraft={setText}
                  ensureProject={ensureProject}
                  onState={(id, next) => {
                    if (activeId.current === id)
                      setState((current) =>
                        next.revision >= current.revision ? next : current,
                      );
                  }}
                  onSelect={(id, take) =>
                    take.kind === "video"
                      ? void addToFilm(id, take.id)
                      : void action({
                          action: "select",
                          sceneId: id,
                          takeId: take.id,
                        })
                  }
                  onReview={(id, take) =>
                    void action(
                      { action: "reviewTake", sceneId: id, takeId: take.id },
                      "Checking character appearance",
                    )
                  }
                  onSubmitting={(value) => {
                    sceneSubmittingRef.current = value;
                    setSceneSubmitting(value);
                  }}
                  onError={setError}
                />
              )}
              {tab === "scenes" && !scene && (
                <div className="studio-empty">
                  <Clapperboard style={{ margin: "0 auto 12px" }} />
                  Your approved scenes will appear here.
                  <br />
                  <button
                    className="studio-btn"
                    style={{ marginTop: 16 }}
                    onClick={() => switchTab("plan")}
                  >
                    Go to Plan
                  </button>
                </div>
              )}
              {tab === "scenes" && scene && !sceneThread && (
                <>
                  {scene.outdated && (
                    <p className="studio-muted">
                      This scene’s plan or character profile changed. Existing
                      takes are preserved; new takes will use your updated
                      direction.
                    </p>
                  )}
                  {scene.takes
                    .filter((take) => !take.jobId)
                    .map((take, index) => (
                      <article className="studio-take" key={take.id}>
                        <h3>
                          {scene.title}{" "}
                          <span className="studio-muted">
                            · {take.kind} take {index + 1}
                          </span>
                        </h3>
                        {take.status === "complete" && take.url ? (
                          take.kind === "video" ? (
                            <video
                              controls
                              playsInline
                              preload="metadata"
                              src={`/api/studio/${projectId}/media?sceneId=${scene.id}&takeId=${take.id}`}
                            />
                          ) : (
                            <img
                              alt={`${scene.title}, take ${index + 1}`}
                              src={`/api/studio/${projectId}/media?sceneId=${scene.id}&takeId=${take.id}`}
                            />
                          )
                        ) : (
                          <div className="studio-status">
                            {["queued", "rendering"].includes(take.status) && (
                              <Loader2 className="studio-spinner" />
                            )}
                            {take.error || take.status}
                          </div>
                        )}
                        <div className="studio-take-footer">
                          <small>
                            {take.kind === "video"
                              ? capabilities.nativeVideo ? "5 sec · native audio" : "5 sec · 480p"
                              : "Scene reference image"}
                            {scene.selectedImageId === take.id ||
                            scene.selectedVideoId === take.id
                              ? " · Selected"
                              : ""}
                          </small>
                          {take.status === "complete" && (
                            <button
                              className="studio-btn primary"
                              disabled={
                                !!busy ||
                                !!continuityProblem(state, scene, take)
                              }
                              onClick={() =>
                                take.kind === "video"
                                  ? void addToFilm(scene.id, take.id)
                                  : void action({
                                      action: "select",
                                      sceneId: scene.id,
                                      takeId: take.id,
                                    })
                              }
                            >
                              {take.kind === "video" ? (
                                state.timeline.includes(scene.id) &&
                                scene.selectedVideoId === take.id ? (
                                  <>
                                    <Check /> In your film
                                  </>
                                ) : (
                                  <>
                                    <Plus /> Add to film
                                  </>
                                )
                              ) : scene.selectedImageId === take.id ? (
                                <>
                                  <Check /> Image selected
                                </>
                              ) : (
                                "Use this image"
                              )}
                            </button>
                          )}
                        </div>
                        <ContinuityCheck
                          take={take}
                          busy={!!busy}
                          problem={continuityProblem(state, scene, take)}
                          onReview={() =>
                            void action(
                              {
                                action: "reviewTake",
                                sceneId: scene.id,
                                takeId: take.id,
                              },
                              "Checking character appearance",
                            )
                          }
                        />
                        <button
                          className="studio-btn"
                          onClick={() => {
                            setSceneThread({
                              id: "",
                              sceneId: scene.id,
                              title: `${scene.title} · Revision thread`,
                              parentTakeId: take.id,
                            });
                            document
                              .querySelector<HTMLTextAreaElement>(
                                ".studio-composer textarea",
                              )
                              ?.focus();
                          }}
                        >
                          Refine this take
                        </button>
                        <details style={{ marginTop: 10 }}>
                          <summary
                            className="studio-muted"
                            style={{ cursor: "pointer" }}
                          >
                            <MoreHorizontal
                              style={{ display: "inline-block" }}
                            />{" "}
                            Take details
                          </summary>
                          <div className="studio-take-menu">
                            <p
                              className="studio-muted"
                              style={{ whiteSpace: "pre-wrap" }}
                            >
                              {take.prompt}
                            </p>
                            {take.url && (
                              <a
                                className="studio-export-link"
                                href={`/api/studio/${projectId}/media?sceneId=${scene.id}&takeId=${take.id}`}
                                download={`${scene.title}.${take.kind === "video" ? "mp4" : "png"}`}
                              >
                                Download original
                              </a>
                            )}
                          </div>
                        </details>
                      </article>
                    ))}
                  <div className="studio-generation">
                    <h3>
                      {scene.takes.length ? "Another take?" : scene.title}
                    </h3>
                    <p>{scene.description}</p>
                    <div className="studio-row">
                      <button
                        className="studio-btn primary"
                        disabled={!!busy}
                        onClick={() => {
                          const references = state.characters.some(
                            (character) =>
                              scene.characterIds.includes(character.id) &&
                              character.locked &&
                              character.referenceId,
                          );
                          void sceneQueue.current?.submit(
                            `Generate ${scene.title}`,
                            {
                              sceneId: scene.id,
                              kind:
                                !direct && references && needsSceneImage
                                  ? "image"
                                  : "video",
                              direct,
                            },
                          );
                        }}
                      >
                        {!direct &&
                        needsSceneImage &&
                        state.characters.some(
                          (character) =>
                            scene.characterIds.includes(character.id) &&
                            character.referenceId &&
                            character.locked,
                        )
                          ? "Generate reference scene image"
                          : "Generate video"}
                        <ArrowRight />
                      </button>
                      <button
                        className="studio-btn"
                        onClick={() => setAdjust(!adjust)}
                        aria-expanded={adjust}
                      >
                        Adjust <ChevronDown />
                      </button>
                      <span className="studio-muted">
                        Uses your provider credits
                      </span>
                    </div>
                    {adjust && (
                      <div className="studio-adjust">
                        <p>
                          For stronger continuity: generate a scene image with
                          your locked references, select it, then generate
                          video. Text-only video uses the appearance
                          description.
                        </p>
                        <label>
                          <input
                            type="checkbox"
                            checked={direct}
                            onChange={(event) =>
                              setDirect(event.target.checked)
                            }
                          />{" "}
                          Generate directly from text
                        </label>
                        <div className="studio-row">
                          <button
                            className="studio-btn"
                            disabled={!!busy}
                            onClick={() =>
                              void sceneQueue.current?.submit(
                                `Generate an image for ${scene.title}`,
                                { sceneId: scene.id, kind: "image", direct },
                              )
                            }
                          >
                            Generate image
                          </button>
                          {!capabilities.nativeVideo && <button
                            className="studio-btn"
                            disabled={!!busy}
                            onClick={() =>
                              void action(
                                {
                                  action: "generate",
                                  sceneId: scene.id,
                                  kind: "voice",
                                },
                                "Generating dialogue",
                              )
                            }
                          >
                            Generate dialogue
                          </button>}
                          {!capabilities.nativeVideo && <button
                            className="studio-btn"
                            disabled={!!busy}
                            onClick={() =>
                              void action(
                                {
                                  action: "generate",
                                  sceneId: scene.id,
                                  kind: "music",
                                },
                                "Generating background music",
                              )
                            }
                          >
                            Generate music
                          </button>}
                        </div>
                        <SceneForm
                          key={`${scene.id}:${scene.description}:${JSON.stringify(scene.dialogues)}`}
                          scene={scene}
                          characters={state.characters}
                          busy={!!busy}
                          onSave={(body) => void action(body)}
                        />
                      </div>
                    )}
                    {scene.dialogues.some((line) => line.audioUrl) && (
                      <details className="studio-scene-audio">
                        <summary>Dialogue preview</summary>
                        {scene.dialogues.map(
                          (line, index) =>
                            line.audioUrl && (
                              <div key={index}>
                                <p className="studio-muted">
                                  {line.character}: {line.text}
                                </p>
                                <audio
                                  controls
                                  src={`/api/studio/${projectId}/media?sceneId=${scene.id}&kind=voice&index=${index}`}
                                />
                              </div>
                            ),
                        )}
                      </details>
                    )}
                    {scene.musicUrl && (
                      <details className="studio-scene-audio">
                        <summary>Background music</summary>
                        <audio
                          controls
                          src={`/api/studio/${projectId}/media?sceneId=${scene.id}&kind=music`}
                        />
                      </details>
                    )}
                  </div>
                </>
              )}
              {tab === "assemble" && (
                <FilmAssembly
                  key={projectId || "new"}
                  state={state}
                  projectId={projectId}
                  disabled={!!busy}
                  onAction={action}
                  onExporting={setExporting}
                  onError={setError}
                  onSaveExport={saveExport}
                  mp4Export={capabilities.mp4Export}
                  onRenderState={(next) => setState(current => next.revision >= current.revision ? next : current)}
                />
              )}
              {tab === "assemble" &&
                state.messages
                  .filter((message) => message.tab === "assemble")
                  .slice(-8)
                  .map((message) => (
                    <article
                      className={`studio-message ${message.role}`}
                      key={message.id}
                      style={{ marginTop: 24 }}
                    >
                      <div className="studio-message-content">
                        <div className="studio-message-text">
                          {message.text}
                        </div>
                        <DirectorTools
                          message={message}
                          projectId={projectId}
                          disabled={!!busy || exporting}
                          onChoose={(value) => void send(value)}
                          onRetry={() =>
                            void action(
                              {
                                action: "generateChatImage",
                                messageId: message.id,
                              },
                              "Starting your image",
                            )
                          }
                          onRefresh={() =>
                            void action(
                              { action: "poll" },
                              "Checking image status",
                            )
                          }
                          onSaveReference={(name) =>
                            void saveCharacterReference(message.id, name)
                          }
                          onReview={() =>
                            void action(
                              {
                                action: "reviewChatImage",
                                messageId: message.id,
                              },
                              "Checking character appearance",
                            )
                          }
                        />
                        {message.editProposal && (
                          <div className="studio-plan-card">
                            <strong>Proposed edit</strong>
                            {message.editProposal.map((item, index) => (
                              <p key={index}>
                                {state.scenes.find(
                                  (scene) => scene.id === item.sceneId,
                                )?.title || "Scene"}
                                :{" "}
                                {Object.entries(item.changes)
                                  .map(
                                    ([name, value]) =>
                                      `${editLabels[name] || name}: ${typeof value !== "number" ? "updated" : name.endsWith("Volume") ? `${Math.round(value * 100)}%` : name === "end" && value === 0 ? "full clip" : `${value}s`}`,
                                  )
                                  .join(", ")}
                              </p>
                            ))}
                            <button
                              className="studio-btn primary"
                              disabled={!!busy || exporting || message.approved}
                              onClick={() =>
                                void action({
                                  action: "applyEdits",
                                  messageId: message.id,
                                })
                              }
                            >
                              {message.approved
                                ? "Edits applied"
                                : "Apply edits"}
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
              {busy && (
                <div className="studio-status" role="status">
                  <Loader2 className="studio-spinner" />
                  {busy}…
                </div>
              )}
              <div ref={endOfChat} className="studio-chat-footer" />
            </div>
          </div>
          <div className="studio-composer-wrap">
            {uploadOpen && (
              <div className="studio-upload">
                <div
                  className="studio-row"
                  style={{ justifyContent: "space-between" }}
                >
                  <strong>Add a reference or script</strong>
                  <button
                    className="studio-icon"
                    aria-label="Close attachment"
                    onClick={() => setUploadOpen(false)}
                  >
                    <X />
                  </button>
                </div>
                <p>
                  Image references are saved to your private project and sent to
                  your AI providers when analysed or used for generation. Upload
                  a single clear character. Voice cloning is planned for a later
                  release.
                </p>
                <input
                  aria-label="Reference image or text file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,.txt,.md"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                />
                <input
                  aria-label="Character name"
                  placeholder="Character name (for an image)"
                  value={characterName}
                  onChange={(event) => setCharacterName(event.target.value)}
                />
                <label className="studio-muted">
                  Reference view
                  <select
                    aria-label="Reference view"
                    value={referenceView}
                    onChange={(event) => setReferenceView(event.target.value)}
                  >
                    <option>Front</option>
                    <option>Left profile</option>
                    <option>Right profile</option>
                    <option>Full body</option>
                    <option>Outfit detail</option>
                    <option>Additional view</option>
                  </select>
                </label>
                <button
                  className="studio-btn primary"
                  disabled={!!busy || !file}
                  onClick={() => void attach()}
                >
                  {file && /\.(txt|md)$/i.test(file.name)
                    ? "Add script to message"
                    : "Analyse character"}
                </button>
              </div>
            )}
            <form
              className="studio-composer"
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              {tab === "scenes" && (
                <div className="scene-composer-target">
                  <span>
                    {sceneThread
                      ? `${sceneThread.title}${sceneThread.parentTakeId ? " · Based on the selected take" : ""}`
                      : "All scenes · Mention a scene number to direct it"}
                  </span>
                  {sceneThread && (
                    <button type="button" onClick={() => setSceneThread(null)}>
                      Back to all scenes
                    </button>
                  )}
                </div>
              )}
              <textarea
                disabled={exporting}
                aria-label="Message your director"
                placeholder={
                  tab === "assemble"
                    ? "Ask for an edit: lower music, trim a scene, or delay dialogue…"
                    : tab === "plan"
                      ? "Describe your idea, paste a script, or ask what’s next…"
                      : "Describe a change, or ask your director…"
                }
                value={text}
                maxLength={24000}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="studio-composer-bottom">
                <button
                  className="studio-icon"
                  type="button"
                  aria-label="Attach a reference image or text"
                  onClick={() => setUploadOpen(!uploadOpen)}
                >
                  <Paperclip />
                </button>
                <button
                  className="studio-send"
                  aria-label="Send message"
                  disabled={
                    !!busy || sceneSubmitting || exporting || !text.trim()
                  }
                >
                  <ArrowUp />
                </button>
              </div>
            </form>
            <p className="studio-composer-note">
              Pick a direction or write your own. Ask for an image here to
              generate it.
            </p>
          </div>
        </main>
        <aside
          className={`studio-board ${rightOpen ? "" : "collapsed"}`}
          aria-label="Project board"
        >
          {rightOpen ? (
            <>
              <div className="studio-board-head">
                <h2>
                  {tab === "plan"
                    ? "Project board"
                    : tab === "scenes"
                      ? "Scene assets"
                      : "Film overview"}
                </h2>
                <button
                  className="studio-icon"
                  aria-label="Collapse project board"
                  aria-expanded
                  onClick={() => setPanels(leftOpen, false)}
                >
                  <PanelRightClose />
                </button>
              </div>
              <p className="studio-board-subtitle">
                Approved work, always within reach
              </p>
              {tab === "plan" && (
                <>
                  <button
                    className="studio-board-item"
                    onClick={() =>
                      setDetail(detail === "story" ? null : "story")
                    }
                    aria-expanded={detail === "story"}
                  >
                    <FileText />
                    <span style={{ flex: 1 }}>
                      <strong>Story</strong>
                      <small>
                        {state.premise ? state.title : "Your next great idea"}
                      </small>
                    </span>
                    <ChevronRight />
                  </button>
                  {detail === "story" && (
                    <div className="studio-board-detail">
                      <p>
                        {state.premise ||
                          "Discuss your idea and approve a proposed plan to save it here."}
                      </p>
                      {state.world && (
                        <>
                          <h3 style={{ marginTop: 15 }}>
                            World & visual style
                          </h3>
                          <p>{state.world}</p>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
              <button
                className="studio-board-item"
                onClick={() =>
                  setDetail(detail === "characters" ? null : "characters")
                }
                aria-expanded={detail === "characters"}
              >
                <Users />
                <span style={{ flex: 1 }}>
                  <strong>Characters</strong>
                  <small>
                    {state.characters.length
                      ? state.characters
                          .map((character) => character.name)
                          .join(" · ")
                      : "Add a reference or develop your cast"}
                  </small>
                </span>
                <ChevronRight />
              </button>
              {detail === "characters" && (
                <div className="studio-board-detail">
                  {state.characters.map((character) => (
                    <CharacterForm
                      key={`${character.id}:${character.name}:${character.appearance}:${character.locked}`}
                      projectId={projectId!}
                      character={character}
                      busy={!!busy}
                      onSave={(body) => void action(body)}
                      onAddReference={() => {
                        setCharacterName(character.name);
                        setReferenceView("Additional view");
                        setUploadOpen(true);
                      }}
                    />
                  ))}
                  <button
                    className="studio-btn"
                    onClick={() => {
                      setUploadOpen(true);
                      if (tab === "assemble") setTab("plan");
                    }}
                  >
                    Add character reference
                  </button>
                  <p style={{ marginTop: 12 }}>
                    Review visible traits before locking. Reference-based
                    generation improves consistency; exact likeness is not
                    guaranteed.
                  </p>
                </div>
              )}
              <button
                className="studio-board-item"
                onClick={() => setDetail(detail === "scenes" ? null : "scenes")}
                aria-expanded={detail === "scenes"}
              >
                <Clapperboard />
                <span style={{ flex: 1 }}>
                  <strong>Scenes</strong>
                  <small>
                    {state.scenes.length} planned · {readyCount} video
                    {readyCount === 1 ? "" : "s"} ready
                  </small>
                </span>
                <ChevronRight />
              </button>
              {detail === "scenes" && (
                <div className="studio-board-detail">
                  {state.scenes.map((item, index) => (
                    <button
                      key={item.id}
                      className={`studio-board-scene ${scene?.id === item.id ? "active" : ""}`}
                      disabled={exporting}
                      onClick={() => {
                        setSelectedScene(item.id);
                        setSceneThread(null);
                        setTab("scenes");
                        setAdjust(false);
                      }}
                    >
                      <span>
                        {String(index + 1).padStart(2, "0")} · {item.title}
                      </span>
                      <small>
                        {
                          item.takes.filter((take) => take.kind === "video")
                            .length
                        }{" "}
                        takes{item.outdated ? " · Needs review" : ""}
                      </small>
                    </button>
                  ))}
                  {!state.scenes.length && (
                    <p>Approve a scene outline in Plan to get started.</p>
                  )}
                </div>
              )}
              <div className="studio-save-state">
                {busy
                  ? "Working…"
                  : saved
                    ? "Changes saved to your project"
                    : projectId
                      ? "Project restored"
                      : "Start a conversation to create your project"}
              </div>
            </>
          ) : (
            <button
              className="studio-icon"
              aria-label="Expand project board"
              aria-expanded={false}
              onClick={() => setPanels(leftOpen, true)}
            >
              <PanelRightOpen />
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
function CharacterForm({
  character,
  projectId,
  busy,
  onSave,
  onAddReference,
}: {
  character: StudioCharacter;
  projectId: string;
  busy: boolean;
  onSave: (body: object) => void;
  onAddReference: () => void;
}) {
  const [name, setName] = useState(character.name);
  const [appearance, setAppearance] = useState(character.appearance);
  return (
    <div className="studio-character">
      <div className="studio-reference-views">
        {characterReferences(character).map((ref) => (
          <div key={ref.id}>
            <img
              src={`/api/studio/${projectId}/reference?referenceId=${encodeURIComponent(ref.id)}`}
              alt={`${character.name}, ${ref.label}`}
            />
            <small>
              {ref.label}
              {ref.id === character.referenceId ? " · Primary" : ""}
            </small>
            <div className="studio-row">
              {ref.id !== character.referenceId && (
                <button
                  className="studio-btn"
                  disabled={busy}
                  onClick={() =>
                    onSave({
                      action: "reference",
                      characterId: character.id,
                      referenceId: ref.id,
                      operation: "primary",
                    })
                  }
                >
                  Make primary
                </button>
              )}
              <button
                className="studio-btn"
                disabled={busy}
                onClick={() =>
                  onSave({
                    action: "reference",
                    characterId: character.id,
                    referenceId: ref.id,
                    operation: "remove",
                  })
                }
              >
                Remove view
              </button>
            </div>
          </div>
        ))}
      </div>
      {characterReferences(character).length < 6 && (
        <button className="studio-btn" disabled={busy} onClick={onAddReference}>
          Add another reference view
        </button>
      )}
      <label>
        Name
        <input
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        Visible appearance
        <textarea
          rows={7}
          value={appearance}
          maxLength={5000}
          onChange={(event) => setAppearance(event.target.value)}
        />
      </label>
      <div className="studio-row">
        <button
          className="studio-btn primary"
          disabled={busy || !name.trim() || appearance.length < 10}
          onClick={() =>
            onSave({
              action: "character",
              characterId: character.id,
              name,
              appearance,
              locked: true,
            })
          }
        >
          {character.locked ? "Save locked profile" : "Lock appearance"}
        </button>
        {character.locked && (
          <button
            className="studio-icon"
            title="Unlock appearance"
            aria-label="Unlock appearance"
            disabled={busy}
            onClick={() =>
              onSave({
                action: "character",
                characterId: character.id,
                name,
                appearance,
                locked: false,
              })
            }
          >
            <Check />
          </button>
        )}
      </div>
      <p className="studio-muted">
        {character.locked
          ? "Locked · reused in scene generation"
          : "Draft · review before locking"}
      </p>
    </div>
  );
}
function SceneForm({
  scene,
  characters,
  busy,
  onSave,
}: {
  scene: StudioScene;
  characters: StudioCharacter[];
  busy: boolean;
  onSave: (body: object) => void;
}) {
  const [title, setTitle] = useState(scene.title);
  const [description, setDescription] = useState(scene.description);
  const [characterIds, setCharacterIds] = useState(scene.characterIds);
  const [dialogues, setDialogues] = useState(
    scene.dialogues.map(({ character, text }) => ({ character, text })),
  );
  return (
    <details className="studio-scene-edit">
      <summary>Edit scene brief & dialogue</summary>
      <label>
        Title
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label>
        Scene direction
        <textarea
          rows={5}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <p>Characters in this scene</p>
      {characters.map((character) => (
        <label key={character.id} style={{ display: "block" }}>
          <input
            style={{ width: "auto", marginRight: 8 }}
            type="checkbox"
            checked={characterIds.includes(character.id)}
            onChange={(event) =>
              setCharacterIds((current) =>
                event.target.checked
                  ? [...current, character.id]
                  : current.filter((id) => id !== character.id),
              )
            }
          />
          {character.name}
          {character.locked ? " · locked" : ""}
        </label>
      ))}
      {dialogues.map((line, index) => (
        <div key={index} style={{ marginTop: 12 }}>
          <input
            aria-label={`Dialogue ${index + 1} character`}
            placeholder="Character"
            value={line.character}
            onChange={(event) =>
              setDialogues((current) =>
                current.map((item, i) =>
                  i === index
                    ? { ...item, character: event.target.value }
                    : item,
                ),
              )
            }
          />
          <textarea
            aria-label={`Dialogue ${index + 1} text`}
            value={line.text}
            onChange={(event) =>
              setDialogues((current) =>
                current.map((item, i) =>
                  i === index ? { ...item, text: event.target.value } : item,
                ),
              )
            }
          />
          <button
            className="studio-btn"
            onClick={() =>
              setDialogues((current) => current.filter((_, i) => i !== index))
            }
          >
            Remove line
          </button>
        </div>
      ))}
      <div className="studio-row" style={{ marginTop: 12 }}>
        <button
          className="studio-btn"
          disabled={dialogues.length >= 12}
          onClick={() =>
            setDialogues((current) => [
              ...current,
              { character: "Narrator", text: "" },
            ])
          }
        >
          Add dialogue
        </button>
        <button
          className="studio-btn primary"
          disabled={
            busy ||
            !title.trim() ||
            !description.trim() ||
            dialogues.some((line) => !line.text.trim())
          }
          onClick={() =>
            onSave({
              action: "scene",
              sceneId: scene.id,
              title,
              description,
              characterIds,
              dialogues,
            })
          }
        >
          Save scene changes
        </button>
      </div>
    </details>
  );
}
