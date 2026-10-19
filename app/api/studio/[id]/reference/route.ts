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
import { generationLockMs } from "@/lib/film/duration";
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
      Date.now() - Date.parse(loaded.state.operation.startedAt) <
        generationLockMs(loaded.state.clipSeconds)
    )
      throw new StudioError(
        "Wait for the current generation to finish before changing references.",
        409,
      );
    const form = await req.formData();
    const file = form.get("file");
    const requestedName = String(form.get("name") || "")
      .trim()
      .slice(0, 100);
    const createCharacter = form.get("createCharacter") === "true";
    const skipAnalysis = form.get("skipAnalysis") === "true";
    let name = requestedName;
    // A photo-first character does not need a guessed real-world identity.
    // Give it an editable, unique working name until the writer names it.
    if (!name) {
      let number = loaded.state.characters.length + 1;
      do { name = `Character ${number++}`; }
      while (loaded.state.characters.some(item => item.name.toLowerCase() === name.toLowerCase()));
    }
    const label = String(form.get("view") || "Additional view")
      .trim()
      .slice(0, 60);
    // Identity is the character id. A name is display text the user can edit
    // and can legitimately collide, so it addresses an EXISTING character only
    // when no id was supplied and that name identifies exactly one of them.
    const characterId = String(form.get("characterId") || "").trim();
    const byName = createCharacter ? [] : loaded.state.characters.filter(
      (character) => character.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (createCharacter && loaded.state.characters.some(
      character => character.name.trim().toLowerCase() === name.toLowerCase(),
    )) throw new StudioError("Choose a unique character name.");
    if (!characterId && byName.length > 1)
      throw new StudioError(
        `More than one character here is called "${name}". Add the view from that character's own card, or rename them so the names identify one person each.`,
      );
    const matching = characterId
      ? loaded.state.characters.find((character) => character.id === characterId)
      : byName[0];
    if (characterId && !matching) throw new StudioError("Character not found.", 404);
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
    if (loaded.state.characters.length >= 12 && !matching)
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
    // Approving a portrait created from this character's saved description is
    // a reference-only action. Re-analysing it sends an unnecessary vision
    // request and used to surface a provider rate-limit error here.
    if (skipAnalysis && !matching)
      throw new StudioError("Only an existing character's generated portrait can skip photo analysis.");
    const analysis = skipAnalysis && matching
      ? { appearance: matching.appearance }
      : await analyseCharacter([...previousImages, image], name);
    const reference = await prisma.filmReference.create({
      data: { workspaceId: loaded.project.id, content: JSON.stringify(image) },
    });
    createdId = reference.id;
    const state = structuredClone(loaded.state);
    state.mode = state.mode || "develop";
    const target = matching
      ? state.characters.find((character) => character.id === matching.id)
      : undefined;
    if (target) {
      target.referenceId ||= reference.id;
      target.references = [
        ...refs,
        { id: reference.id, label: label || "Additional view" },
      ];
      // Re-read from every view together, so this supersedes the old text.
      // The lock is released because the user has not reviewed this version.
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
      text: skipAnalysis
        ? `I've added the approved portrait as a reference for ${name}. Review and lock the identity when it looks right.`
        : `I've updated ${name}'s appearance from ${refs.length + 1} reference view${refs.length ? "s" : ""}. Open Characters to review, correct, and lock the combined profile before generating.`,
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
