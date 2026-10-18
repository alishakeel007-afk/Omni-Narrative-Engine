import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getEnvValue } from "@/lib/env";

export const runtime = "nodejs";
const schema = z.object({ prompt: z.string().trim().min(1).max(12000), name: z.string().max(200), duration: z.number().int().min(1).max(60).default(5) });
const base = "https://api.magichour.ai/v1";
function signature(key: string, user: string, id: string) {
  return createHmac("sha256", key).update(JSON.stringify([user, id])).digest("hex");
}

async function handle(req: Request, create: boolean) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const key = getEnvValue(["MAGIC_HOUR_API_KEY"]);
    if (!key) return NextResponse.json({ error: "Magic Hour API key is not configured." }, { status: 503 });
    let path = "/text-to-video";
    let body: string | undefined;
    if (create) {
      const parsed = schema.safeParse(await req.json());
      if (!parsed.success) return NextResponse.json({ error: "Provide a scene prompt, name, and duration between 1 and 60 seconds." }, { status: 400 });
      body = JSON.stringify({ name: parsed.data.name, style: { prompt: parsed.data.prompt }, end_seconds: parsed.data.duration, model: "ltx-2.5", resolution: "480p", aspect_ratio: "16:9", audio: false });
    } else {
      const params = new URL(req.url).searchParams;
      const id = params.get("id") || "";
      const token = params.get("token") || "";
      const expected = signature(key, user.id, id);
      if (!/^[a-zA-Z0-9_-]{1,150}$/.test(id) || token.length !== expected.length || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
        return NextResponse.json({ error: "Invalid video access token." }, { status: 403 });
      }
      path = `/video-projects/${encodeURIComponent(id)}`;
    }
    const response = await fetch(base + path, { method: create ? "POST" : "GET", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body, cache: "no-store", signal: AbortSignal.timeout(30000) });
    const data = await response.json();
    if (!response.ok) {
      const message = response.status === 402 ? "Magic Hour has insufficient credits." : response.status === 401 ? "Magic Hour rejected the configured API key." : `Magic Hour request failed (${response.status}).`;
      return NextResponse.json({ error: message }, { status: response.status === 402 ? 402 : 502 });
    }
    if (create) {
      if (typeof data.id !== "string") throw new Error("Missing job ID");
      return NextResponse.json({ id: data.id, token: signature(key, user.id, data.id), status: "queued" });
    }
    return NextResponse.json({ status: data.status, url: data.downloads?.[0]?.url, error: data.status === "error" ? "Magic Hour could not render this scene." : undefined });
  } catch {
    return NextResponse.json({ error: "Unable to reach video generation. Try checking status again before creating another clip." }, { status: 502 });
  }
}
export const POST = (req: Request) => handle(req, true);
export const GET = (req: Request) => handle(req, false);
