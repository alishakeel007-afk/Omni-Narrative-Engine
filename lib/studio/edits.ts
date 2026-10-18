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
