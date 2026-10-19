import { z } from "zod";
export const textOverlaySchema = z
  .object({
    text: z.string().max(500),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    size: z.number().int().min(16).max(96),
    color: z.string().regex(/^#[a-f0-9]{6}$/i),
    start: z.number().min(0).max(60),
    end: z.number().min(0).max(60),
  })
  .refine(
    (value) => !value.end || value.end > value.start,
    "Text end must follow its start.",
  );
export const studioEditSchema = z
  .object({
    start: z.number().min(0).max(60),
    end: z.number().min(0).max(60),
    voiceDelay: z.number().min(0).max(60),
    voiceVolume: z.number().min(0).max(1),
    musicVolume: z.number().min(0).max(1),
    videoVolume: z.number().min(0).max(1),
    fadeIn: z.number().min(0).max(5).optional(),
    fadeOut: z.number().min(0).max(5).optional(),
    texts: z.array(textOverlaySchema).max(8).optional(),
  })
  .refine(
    (value) => !value.end || value.end > value.start,
    "Trim end must be after start.",
  );

/**
 * One timeline instance. `sourceIn`/`sourceOut` are positions inside the source
 * take; the server additionally checks them against that take's real duration,
 * which this schema cannot know.
 */
export const timelineClipSchema = z
  .object({
    id: z.string().min(1).max(100),
    sceneId: z.string().min(1).max(100),
    sourceTakeId: z.string().min(1).max(100),
    sourceIn: z.number().min(0).max(600),
    sourceOut: z.number().min(0).max(600),
    clipVolume: z.number().min(0).max(1),
    dialogueVolume: z.number().min(0).max(1).optional(),
    musicVolume: z.number().min(0).max(1).optional(),
    fadeIn: z.number().min(0).max(5).optional(),
    fadeOut: z.number().min(0).max(5).optional(),
    texts: z.array(textOverlaySchema).max(8).optional(),
    stale: z.boolean().optional(),
  })
  .refine((value) => value.sourceOut > value.sourceIn, "A clip must end after it starts.")
  .refine(
    (value) => value.sourceOut - value.sourceIn >= 0.5,
    "A clip must be at least half a second long.",
  );

/** Instance ids must be unique: two clips may share a source, not an identity. */
export const timelineClipsSchema = z
  .array(timelineClipSchema)
  .max(24)
  .refine(
    (clips) => new Set(clips.map((clip) => clip.id)).size === clips.length,
    "Each timeline clip needs its own id.",
  );
