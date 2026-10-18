import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import {
  loadStudio,
  referenceData,
  saveStudio,
  StudioError,
} from "@/lib/studio/store";
import { analyseCharacter } from "@/lib/studio/ai";
import { characterReferences } from "@/lib/studio/identity";
export const runtime = "nodejs";
export const maxDuration = 120;
type Context = { params: Promise<{ id: string }> };
export async function POST(req: Request, context: Context) {
  let createdId: string | undefined;
  try {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    if (!user) throw new StudioError("Unauthorized", 401);
    const loaded = await loadStudio(user.id, (await context.params).id);
    if (
      loaded.state.operation &&
      Date.now() - Date.parse(loaded.state.operation.startedAt) < 240000
    )
      throw new StudioError(
        "Wait for the current generation to finish before changing references.",
        409,
      );
    const form = await req.formData();
    const file = form.get("file");
    const name = String(form.get("name") || "New character")
      .trim()
      .slice(0, 100);
    if (!name) throw new StudioError("Give this character a name.");
    const label = String(form.get("view") || "Additional view")
      .trim()
      .slice(0, 60);
    const matching = loaded.state.characters.find(
      (character) => character.name.toLowerCase() === name.toLowerCase(),
    );
    const refs = matching ? characterReferences(matching) : [];
    if (refs.length >= 6)
      throw new StudioError(
        "A character supports six views. Remove an unused view before adding another.",
      );
    if (
      !(file instanceof File) ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 4 * 1024 * 1024 ||
      file.size < 32
    )
      throw new StudioError(
        "Choose a JPG, PNG or WebP character image smaller than 4 MB.",
      );
    if (
      loaded.state.characters.length >= 12 &&
      !loaded.state.characters.some(
        (character) => character.name.toLowerCase() === name.toLowerCase(),
      )
    )
      throw new StudioError("A project supports up to 12 characters.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const valid =
      file.type === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216
        : file.type === "image/png"
          ? bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : bytes.toString("ascii", 0, 4) === "RIFF" &&
            bytes.toString("ascii", 8, 12) === "WEBP";
    if (!valid)
      throw new StudioError("The uploaded file does not match its image type.");
    const image = { mimeType: file.type, data: bytes.toString("base64") };
    const previousImages = await Promise.all(
      refs.map((ref) => referenceData(loaded.project.id, ref.id)),
    );
    const analysis = await analyseCharacter([...previousImages, image], name);
    const reference = await prisma.filmReference.create({
      data: { workspaceId: loaded.project.id, content: JSON.stringify(image) },
    });
    createdId = reference.id;
    const state = structuredClone(loaded.state);
    state.mode = state.mode || "develop";
    const target = state.characters.find(
      (character) => character.name.toLowerCase() === name.toLowerCase(),
    );
    if (target) {
      target.referenceId ||= reference.id;
      target.references = [
        ...refs,
        { id: reference.id, label: label || "Additional view" },
      ];
      target.appearance = analysis.appearance;
      target.locked = false;
      state.scenes
        .filter((scene) => scene.characterIds.includes(target.id))
        .forEach((scene) => {
          scene.outdated = true;
        });
    } else
      state.characters.push({
        id: randomUUID(),
        name,
        appearance: analysis.appearance,
        referenceId: reference.id,
        references: [{ id: reference.id, label: label || "Primary" }],
        locked: false,
      });
    state.messages.push({
      id: randomUUID(),
      role: "assistant",
      text: `I've updated ${name}'s appearance from ${refs.length + 1} reference view${refs.length ? "s" : ""}. Open Characters to review, correct, and lock the combined profile before generating.`,
      tab: "plan",
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ state: await saveStudio(loaded, state) });
  } catch (error) {
    if (createdId)
      await prisma.filmReference
        .delete({ where: { id: createdId } })
        .catch(() => {});
    return NextResponse.json(
      {
        error:
          error instanceof StudioError
            ? error.message
            : "Character analysis could not be completed. No profile was saved.",
      },
      { status: error instanceof StudioError ? error.status : 502 },
    );
  }
}
export async function GET(req: Request, context: Context) {
  try {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    if (!user) throw new StudioError("Unauthorized", 401);
    const loaded = await loadStudio(user.id, (await context.params).id);
    const referenceId = new URL(req.url).searchParams.get("referenceId") || "";
    if (
      !loaded.state.characters.some((character) =>
        characterReferences(character).some((ref) => ref.id === referenceId),
      )
    )
      throw new StudioError("Reference not found.", 404);
    const image = await referenceData(loaded.project.id, referenceId);
    return new Response(Buffer.from(image.data, "base64"), {
      headers: {
        "Content-Type": image.mimeType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Reference unavailable." },
      { status: error instanceof StudioError ? error.status : 500 },
    );
  }
}
