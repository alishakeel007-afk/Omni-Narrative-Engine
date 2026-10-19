"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  ArrowUp,
  ArrowUpRight,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PublicBrand } from "@/components/public/public-shell";
import { AssemblyPreview } from "@/components/public/assembly-preview";
import { EMPTY_STUDIO, type StudioState, type StudioTab } from "@/types/studio";
import { STUDIO_ENTRY_LIMIT, STUDIO_ENTRY_ROUTE, readStudioEntry, removeStudioEntry, saveStudioEntry, studioEntryPath } from "@/lib/studio/entry";

type Trial = {
  id: string | null;
  state: StudioState;
  remaining: number;
  limit: number;
};
const tabs = ["plan", "scenes", "assemble"] as const;
// Earlier homepage examples may still be saved in a browser's conversation.
// Reveal those only on request; never insert them as a new user's starting idea.
const legacyExamplePrompts = new Set([
  "Help me develop a story about the last lighthouse in a forgotten city above the clouds.",
  "Help me develop a story about a young lighthouse keeper who discovers the light carries memories from ships that never returned.",
]);
export default function GuestStudioScreen({
  embedded = false,
  activeTab,
  onTabChange,
}: {
  embedded?: boolean;
  activeTab?: StudioTab;
  onTabChange?: (tab: StudioTab) => void;
}) {
  const router = useRouter();
  const { currentUser, loading } = useAuth();
  const [trial, setTrial] = useState<Trial>({
    id: null,
    state: structuredClone(EMPTY_STUDIO),
    remaining: 3,
    limit: 3,
  });
  const [localTab, setLocalTab] = useState<StudioTab>("plan");
  const [archivedExampleIds, setArchivedExampleIds] = useState<Set<string>>(new Set());
  function restoreConversation(data: Trial) {
    const userMessages = data.state.messages.filter((message) => message.role === "user");
    if (embedded && userMessages.length && userMessages.every((message) => legacyExamplePrompts.has(message.text.trim()))) {
      setArchivedExampleIds(new Set(data.state.messages.map((message) => message.id)));
    }
    setTrial(data);
  }
  const tab = activeTab ?? localTab;
  function setTab(value: StudioTab) {
    setLocalTab(value);
    onTabChange?.(value);
  }
  const [drafts, setDrafts] = useState<Record<StudioTab, string>>({ plan: "", scenes: "", assemble: "" });
  const text = drafts[tab];
  function setText(value: string | ((current: string) => string), targetTab = tab) {
    setDrafts((current) => ({ ...current, [targetTab]: typeof value === "function" ? value(current[targetTab]) : value }));
  }
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [board, setBoard] = useState(false);
  const [pending, setPending] = useState<{ text: string; tab: StudioTab } | null>(null);
  const [focused, setFocused] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const privateProject = useRef<string | null>(null);
  const initializedUser = useRef<string | null>(null);
  const initialized = useRef(false);
  const busyRef = useRef(false);
  const retry = useRef<{ text: string; tab: StudioTab; id: string } | null>(
    null,
  );
  const initialId = useRef<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const visibleMessages = trial.state.messages.filter((message) => message.tab === tab && !archivedExampleIds.has(message.id));
  const hasArchivedExample = trial.state.messages.some((message) => message.tab === tab && archivedExampleIds.has(message.id));
  const visiblePending = pending?.tab === tab ? pending : null;
  const assemblyPreview = embedded && tab === "assemble";
  const plan = [...trial.state.messages]
    .reverse()
    .find((message) => message.plan)?.plan;
  async function receive(response: Response): Promise<Trial> {
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        data.error || "Your director couldn't reply. Please try again.",
      );
    return data;
  }
  function continueToAccount(
    value = trial,
    target = "signup",
    pendingText?: string,
  ) {
    let next = STUDIO_ENTRY_ROUTE;
    try {
      const latest = [...value.state.messages]
        .reverse()
        .find((message) => message.role === "user")?.text;
      const id = saveStudioEntry(
        latest ||
          pendingText ||
          "Continue my conversation with my creative director.",
        window.localStorage,
        { guestProjectId: value.id || undefined, tab, pendingText },
      );
      next = studioEntryPath(id);
    } catch {
      /* The server-side guest cookie still permits recovery after login. */
    }
    router.push(`/${target}?next=${encodeURIComponent(next)}` as Route);
  }
  async function send(
    value = text,
    selectedTab = tab,
    mode?: "discover" | "develop",
  ) {
    if (!value.trim() || busyRef.current || !ready || loading) return;
    if (currentUser && !embedded) {
      router.replace(STUDIO_ENTRY_ROUTE as Route);
      return;
    }
    if (!currentUser && !trial.remaining) {
      continueToAccount(trial, "signup", value.trim());
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    setPending({ text: value.trim(), tab: selectedTab });
    setText("", selectedTab);
    const requestId =
      initialId.current &&
      readStudioEntry(initialId.current)?.text === value.trim()
        ? initialId.current
        : retry.current?.text === value.trim() &&
            retry.current.tab === selectedTab
          ? retry.current.id
          : crypto.randomUUID();
    retry.current = { id: requestId, text: value.trim(), tab: selectedTab };
    try {
      if (currentUser) {
        if (!privateProject.current) {
          const response = await fetch("/api/studio", { method: "POST" });
          const created = await response.json();
          if (!response.ok) throw new Error(created.error || "Could not start your story.");
          privateProject.current = created.id;
          try { localStorage.setItem(`omni-home-project:${currentUser.id}`, created.id); } catch { /* Optional recovery. */ }
        }
        const data = await receive(await fetch(`/api/studio/${privateProject.current}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "chat", text: value.trim(), tab: selectedTab, mode: mode || trial.state.mode || "develop" }),
        }));
        setTrial((current) => ({ ...current, state: data.state }));
        retry.current = null;
        return;
      }
      const data = await receive(
        await fetch("/api/studio/guest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: value.trim(),
            tab: selectedTab,
            requestId,
            mode,
          }),
        }),
      );
      setTrial(data);
      retry.current = null;
      setText((current) => (current.trim() === value.trim() ? "" : current), selectedTab);
      if (initialId.current) {
        removeStudioEntry(initialId.current);
        initialId.current = null;
        window.history.replaceState(null, "", "/try");
      }
      if (!data.remaining) continueToAccount(data);
    } catch (cause) {
      setText((current) => current || value, selectedTab);
      setError(
        cause instanceof Error
          ? cause.message
          : "Your director couldn't reply. Please try again.",
      );
    } finally {
      setPending(null);
      busyRef.current = false;
      setBusy(false);
      if (embedded && window.matchMedia("(pointer: fine)").matches) composer.current?.focus({ preventScroll: true });
    }
  }
  useEffect(() => {
    if (loading) return;
    if (embedded && currentUser) {
      if (initializedUser.current === currentUser.id) return;
      initializedUser.current = currentUser.id;
      setReady(false);
      let id: string | null = null;
      try { id = localStorage.getItem(`omni-home-project:${currentUser.id}`); } catch { /* Optional recovery. */ }
      if (!id) { setReady(true); return; }
      void fetch(`/api/studio/${id}`, { cache: "no-store" }).then(receive).then((data) => {
        privateProject.current = id;
        restoreConversation({ ...trial, state: data.state });
      }).catch((cause) => setError(cause.message)).finally(() => setReady(true));
      return;
    }
    if (currentUser) {
      const start = new URLSearchParams(window.location.search).get("start");
      router.replace((start ? studioEntryPath(start) : STUDIO_ENTRY_ROUTE) as Route);
      return;
    }
    if (initialized.current) return;
    initialized.current = true;
    const id = embedded ? null : new URLSearchParams(window.location.search).get("start");
    const entry = readStudioEntry(id);
    initialId.current = entry ? id : null;
    if (entry) setText(entry.text);
    void fetch("/api/studio/guest", { cache: "no-store" })
      .then(receive)
      .then((data) => {
        restoreConversation(data);
        setReady(true);
      })
      .catch((cause) => {
        setError(cause.message);
        setReady(true);
      });
  }, [loading, currentUser, router, embedded]);
  useEffect(() => {
    if (!ready || !initialId.current || busyRef.current) return;
    const entry = readStudioEntry(initialId.current);
    if (entry) void send(entry.text);
    // Only the initial saved message is dispatched automatically, once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  useEffect(() => {
    if (embedded) {
      const scroll = conversation.current;
      scroll?.scrollTo({ top: scroll.scrollHeight, behavior: "smooth" });
      return;
    }
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [trial.state.messages.length, busy, pending, embedded, tab]);
  useEffect(() => {
    if (!embedded) return;
    const input = composer.current;
    if (!input) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && window.matchMedia("(pointer: fine)").matches &&
          (document.activeElement === document.body || document.activeElement?.closest(".public-hero"))) {
        input.focus({ preventScroll: true });
      }
    }, { threshold: 1 });
    observer.observe(input);
    return () => observer.disconnect();
  }, [embedded, tab]);
  useEffect(() => {
    if (!embedded) return;
    const prompt = (event: Event) => {
      setTab("plan");
      setText((event as CustomEvent<string>).detail, "plan");
      requestAnimationFrame(() => composer.current?.focus({ preventScroll: true }));
    };
    window.addEventListener("omni:home-prompt", prompt);
    return () => window.removeEventListener("omni:home-prompt", prompt);
  }, [embedded]);
  return (
    <div className={`film-studio public-trial${embedded ? " public-inline-studio" : ""}`}>
      <header className="studio-top">
        {!embedded && <PublicBrand />}
        <nav className="studio-tabs" role="tablist" aria-label="Story workspace">
          {tabs.map((value, index) => (
            <button
              key={value}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              aria-label={value[0].toUpperCase() + value.slice(1)}
              id={`trial-tab-${value}`}
              aria-controls="trial-conversation"
              aria-selected={tab === value}
              tabIndex={tab === value ? 0 : -1}
              onClick={() => setTab(value)}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 2
                      : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
                setTab(tabs[next]);
                tabRefs.current[next]?.focus();
              }}
            >
              {embedded && <span className="public-tab-number">0{index + 1}</span>}
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </nav>
        {!embedded && <button
          className="trial-login"
          onClick={() =>
            continueToAccount(trial, "auth", text.trim() || undefined)
          }
        >
          Log in <ArrowUpRight size={15} />
        </button>}
      </header>
      <div className="studio-body">
        <main className="studio-main">
          {!embedded && <div className="studio-context">
            <span>
              {tab === "plan"
                ? "Find the story you want to tell"
                : tab === "scenes"
                  ? "Explore a scene, a character, or a camera direction"
                  : "Shape your sequence, sound, and finishing touches"}
            </span>
            <button
              className="studio-icon"
              aria-label={
                board ? "Collapse project board" : "Expand project board"
              }
              aria-expanded={board}
              onClick={() => setBoard(!board)}
            >
              {board ? <PanelRightClose /> : <PanelRightOpen />}
            </button>
          </div>}
          {error && (
            <div role="alert" className="studio-error">
              {error}
            </div>
          )}
          <div
            className="studio-scroll"
            ref={conversation}
            id="trial-conversation"
            role="tabpanel"
            aria-labelledby={`trial-tab-${tab}`}
            tabIndex={0}
          >
            <div className="studio-chat">
              {assemblyPreview ? <AssemblyPreview /> : <>
              {hasArchivedExample && (
                <button type="button" className="public-resume-conversation" onClick={() => setArchivedExampleIds(new Set())}>
                  Resume previous conversation <ArrowUpRight size={12} />
                </button>
              )}
              {!visibleMessages.length && !visiblePending && (
                <div className="studio-welcome">
                  {embedded ? <h3>{tab === "scenes" ? "Bring a scene to life." : "What story will you tell?"}</h3> : <h1>{tab === "scenes" ? "Bring a scene to life." : "Your creative director partner."}</h1>}
                  <p>
                    {tab === "plan" ? "Find an idea. Or build on yours." : tab === "scenes" ? "Picture the moment. Shape the scene." : "Find the rhythm. Bring it together."}
                  </p>
                  <div className="studio-starters">
                    <button
                      disabled={!ready || busy}
                      onClick={() =>
                        void send(
                          tab === "plan" ? "I don't have an idea yet. Help me find a story worth telling." : tab === "scenes" ? "Help me shape the opening scene of my story." : "Suggest pacing for my story.",
                          tab,
                          tab === "plan" ? "discover" : undefined,
                        )
                      }
                    >
                      <div>
                        <strong>{tab === "plan" ? "Help me find an idea" : tab === "scenes" ? "Shape the opening" : "Find the pace"}</strong>
                      </div>
                    </button>
                    <button
                      disabled={!ready || busy}
                      onClick={() => {
                        if (tab !== "plan") { void send(tab === "scenes" ? "Help me develop a character for my story." : "Suggest dialogue and music for my story."); return; }
                        setText("I have an idea about ");
                        document
                          .querySelector<HTMLTextAreaElement>(
                            ".public-trial textarea",
                          )
                          ?.focus();
                      }}
                    >
                      <div>
                        <strong>{tab === "plan" ? "Develop my idea" : tab === "scenes" ? "Explore a character" : "Find the sound"}</strong>
                      </div>
                    </button>
                  </div>
                </div>
              )}
              {visibleMessages.map((message) => (
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
                    <small className="trial-message-tab">{message.tab}</small>
                    <div className="studio-message-text">{message.text}</div>
                    {message.choices?.length ? (
                      <div className="trial-choices">
                        {message.choices.map((choice) => (
                          <button
                            key={choice.label}
                            disabled={busy}
                            onClick={() => void send(choice.message, message.tab)}
                          >
                            <strong>{choice.label}</strong>
                            {choice.description && (
                              <span>{choice.description}</span>
                            )}
                            <ArrowUpRight size={14} />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
              {visiblePending && <article className="studio-message user" aria-label="Sending message"><div><small className="trial-message-tab">{visiblePending.tab}</small><div className="studio-message-text">{visiblePending.text}</div></div></article>}
              {visiblePending && (
                <p className="trial-thinking" role="status">
                  Thinking…
                </p>
              )}
              <div ref={end} />
              </>}
            </div>
          </div>
          {!assemblyPreview && <div className="studio-composer-wrap">
            <form
              className="studio-composer"
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <div className="public-caret-field" data-idle={embedded && !focused && !text}>
              <textarea
                ref={composer}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                aria-label="Message your director"
                placeholder={
                  tab === "plan"
                    ? "Tell me your idea…"
                    : tab === "scenes"
                      ? "Describe your scene…"
                      : "Shape the edit…"
                }
                value={text}
                maxLength={STUDIO_ENTRY_LIMIT}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    void send();
                  }
                }}
              />
              </div>
              <div className="studio-composer-bottom">
                <span className="trial-count" role="status">
                  {currentUser ? "Your creative space." : `${trial.remaining} of ${trial.limit} messages left`}
                </span>
                <button
                  className="studio-send"
                  aria-label="Send message"
                  disabled={!ready || loading || busy || !text.trim()}
                >
                  <ArrowUp />
                </button>
              </div>
            </form>
            <p className="studio-composer-note">
              {currentUser ? <a href={privateProject.current ? `/film/${privateProject.current}` : STUDIO_ENTRY_ROUTE}>Open your stories <ArrowUpRight size={12} /></a> : <>Three messages to explore. {embedded && trial.state.messages.length ? <button type="button" className="public-inline-continue" disabled={busy} onClick={() => continueToAccount()}>Keep creating</button> : "Sign in to keep creating."}</>}
            </p>
          </div>}
        </main>
        {board && (
          <aside
            className="studio-board trial-board"
            aria-label="Project board"
          >
            <div className="studio-board-head">
              <h2>
                {tab === "plan"
                  ? "Your story so far"
                  : tab === "scenes"
                    ? "Your scenes"
                    : "Your sequence"}
              </h2>
              <button
                className="studio-icon"
                aria-label="Close project board"
                onClick={() => setBoard(false)}
              >
                <PanelRightClose />
              </button>
            </div>
            <div className="trial-board-body">
              {plan ? (
                <>
                  <h3>{plan.title}</h3>
                  <p>{plan.premise}</p>
                  {tab === "plan"
                    ? plan.characters.map((character) => (
                        <article key={character.name}>
                          <strong>{character.name}</strong>
                          <p>{character.appearance}</p>
                        </article>
                      ))
                    : plan.scenes.map((scene, index) => (
                        <article key={index}>
                          <strong>
                            {index + 1}. {scene.title}
                          </strong>
                          <p>{scene.description}</p>
                        </article>
                      ))}
                </>
              ) : (
                <p>
                  Your characters and scenes will gather here as you shape the
                  plan.
                </p>
              )}
              <button
                className="trial-continue"
                disabled={busy}
                onClick={() => continueToAccount()}
              >
                Keep creating <ArrowUpRight size={15} />
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
