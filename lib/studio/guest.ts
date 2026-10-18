import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createStudio, loadStudio, saveStudio, StudioError } from "./store";
import { directorReply } from "./ai";
import type { StudioState, StudioTab } from "@/types/studio";

export const GUEST_COOKIE = "omni-guest-studio";
export const GUEST_LIMIT = 3;
export const GUEST_LIFETIME = 86400;
export function guestCredentials(cookie?: string) {
  const [id, token, extra] = (cookie || "").split(":");
  return !extra &&
    /^[a-f0-9-]{36}$/i.test(id || "") &&
    /^[a-f0-9]{64}$/i.test(token || "")
    ? { id, owner: `guest:${token}` }
    : null;
}
export async function loadGuest(cookie?: string) {
  const credentials = guestCredentials(cookie);
  if (!credentials) return null;
  try {
    const loaded = await loadStudio(credentials.owner, credentials.id);
    if (
      Date.now() - new Date(loaded.project.createdAt).getTime() >
      GUEST_LIFETIME * 1000
    )
      return null;
    return loaded;
  } catch (error) {
    if (error instanceof StudioError && error.status === 404) return null;
    throw error;
  }
}
export function guestView(id: string, state: StudioState) {
  const used = state.messages.filter(
    (message) => message.role === "user",
  ).length;
  return {
    id,
    state,
    remaining: Math.max(0, GUEST_LIMIT - used),
    limit: GUEST_LIMIT,
  };
}
export async function guestTurn(
  cookie: string | undefined,
  input: {
    text: string;
    tab: StudioTab;
    requestId: string;
    mode?: "discover" | "develop";
  },
) {
  let loaded = await loadGuest(cookie);
  let newCookie: string | undefined;
  if (!loaded) {
    const token = randomBytes(32).toString("hex");
    const project = await createStudio(`guest:${token}`);
    newCookie = `${project.id}:${token}`;
    loaded = await loadStudio(`guest:${token}`, project.id);
  }
  const state = structuredClone(loaded.state);
  // Replaying a completed request returns its saved response and uses no turn.
  if (state.messages.some((message) => message.requestId === input.requestId))
    return { ...guestView(loaded.project.id, state), cookie: newCookie };
  if (guestView(loaded.project.id, state).remaining === 0)
    throw new StudioError("Continue with an account to keep creating.", 403);
  if (
    state.operation &&
    Date.now() - Date.parse(state.operation.startedAt) < 240000
  )
    throw new StudioError(
      "Your director is still replying. Please wait a moment.",
      409,
    );
  state.mode = input.mode || state.mode || "develop";
  state.operation = {
    id: input.requestId,
    startedAt: new Date().toISOString(),
  };
  const reserved = await saveStudio(loaded, state);
  loaded = { ...loaded, state: reserved };
  try {
    const result = await directorReply(
      reserved,
      input.text,
      input.tab,
      undefined,
      true,
    );
    const next = structuredClone(reserved);
    const createdAt = new Date().toISOString();
    next.messages.push(
      {
        id: randomUUID(),
        role: "user",
        text: input.text,
        tab: input.tab,
        requestId: input.requestId,
        createdAt,
      },
      {
        id: randomUUID(),
        role: "assistant",
        text: result.reply,
        tab: input.tab,
        ...(result.plan ? { plan: result.plan } : {}),
        ...(result.choices?.length
          ? {
              choices: result.choices.map((choice) => ({
                label: choice.label,
                message: choice.message,
                ...(choice.description
                  ? { description: choice.description }
                  : {}),
              })),
            }
          : {}),
        createdAt,
      },
    );
    delete next.operation;
    return {
      ...guestView(loaded.project.id, await saveStudio(loaded, next)),
      cookie: newCookie,
    };
  } catch (error) {
    // Release this request's reservation; failed replies do not spend a turn.
    const current = await loadStudio(loaded.project.userId, loaded.project.id);
    if (current.state.operation?.id === input.requestId) {
      const recovered = structuredClone(current.state);
      delete recovered.operation;
      await saveStudio(current, recovered);
    }
    if (newCookie) {
      const failure = new StudioError(
        error instanceof Error
          ? error.message
          : "Your director couldn't reply. Please try again.",
        error instanceof StudioError ? error.status : 503,
      );
      Object.assign(failure, { guestCookie: newCookie });
      throw failure;
    }
    throw error;
  }
}
export async function claimGuest(
  userId: string,
  cookie?: string,
  requestedId?: string,
) {
  const credentials = guestCredentials(cookie);
  const id = requestedId || credentials?.id;
  if (!id) return null;
  // A retried claim can recover a project already transferred to this user.
  try {
    const owned = await loadStudio(userId, id);
    return { id, state: owned.state };
  } catch (error) {
    if (!(error instanceof StudioError && error.status === 404)) throw error;
  }
  if (credentials?.id !== id)
    throw new StudioError("This trial isn't available in this browser.", 404);
  const loaded = await loadGuest(cookie);
  if (!loaded || !loaded.state.messages.length) {
    if (requestedId)
      throw new StudioError(
        "This trial has expired or isn't available in this browser.",
        404,
      );
    return null;
  }
  if (
    loaded.state.operation &&
    Date.now() - Date.parse(loaded.state.operation.startedAt) < 240000
  )
    throw new StudioError(
      "Wait for your director's reply before continuing.",
      409,
    );
  const changed = await prisma.filmWorkspace.updateMany({
    where: {
      id,
      userId: loaded.project.userId,
      revision: loaded.state.revision,
    },
    data: {
      userId,
      revision: loaded.state.revision + 1,
      state: JSON.parse(
        JSON.stringify({
          ...loaded.state,
          revision: loaded.state.revision + 1,
        }),
      ),
    },
  });
  if (!changed.count)
    throw new StudioError("This conversation changed. Please try again.", 409);
  return { id, state: (await loadStudio(userId, id)).state };
}
