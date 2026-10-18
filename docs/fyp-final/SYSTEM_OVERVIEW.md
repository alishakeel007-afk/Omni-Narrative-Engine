# Omni-Narrative Engine: System Overview

## Introduction and objective

Omni-Narrative Engine is a web application for creating interactive and multimedia narrative experiences. It lets authenticated users develop stories, shape scenes and characters, optionally generate supporting media, save projects, and play a browser-based synchronized preview. The implementation prioritises reliable authoring and preview; MP4 composition and export are intentionally out of scope.

## Problem statement

Multimedia storytelling commonly needs separate writing, voice, image, music, storage, and playback tools. This project brings those activities into an account-owned project workflow while retaining user control over authored content.

## Implemented capabilities

- Guided Video Studio with eight stages: Setup, Story Idea, Story Review, Scenes & Dialogues, Voice Audio, Visual Generation, Background Music, and Video Preview.
- Custom Story Builder for manual writing, scene editing, optional AI next-scene suggestions, and account-backed save/resume.
- English and Urdu Video Studio paths. English uses Deepgram TTS; Urdu uses ElevenLabs when configured account-owned voices and provider access are available.
- Groq-primary story generation with a bounded Gemini fallback.
- Server-side image generation, local CC0 sample-based cinematic music, optional intentional silence, media freshness indicators, and synchronized browser preview.
- My Projects, project completion eligibility, stable scene identity, and retained Interactive Story/Memory Board routes.

## Guided and Custom modes

Guided Video Studio is a structured eight-stage workflow centered on an AI-generated script and relational scene/media persistence. Custom Story Builder is manual-first: title, characters, dialogue, narration, order, and direction remain author controlled. AI suggestions are optional, shown as alternatives, and never committed automatically. A local Custom draft becomes account-owned only after an explicit confirmed save.

## Technology stack

| Area | Implementation |
| --- | --- |
| Web | Next.js 15, React 19, TypeScript, Tailwind CSS |
| Auth | Supabase Auth with protected client screens and server checks |
| Data | Supabase PostgreSQL, Prisma, `@prisma/adapter-pg` |
| Media storage | Supabase Storage with server-generated project paths |
| Story AI | Groq primary, Gemini fallback |
| Speech | Deepgram for English; ElevenLabs for Urdu |
| Images | Server-side image-provider abstraction |
| Music | Browser-side CC0 sample-based cinematic score engine |

## Limitations

- The preview is browser playback; MP4 rendering/export is not implemented.
- Provider output depends on configured credentials, quotas, networks, and third-party availability.
- Browser audio, provider output, Storage policies, and deployment configuration require live/manual verification.
- No durable application-level per-user rate limiter was found for provider-backed endpoints.
- Custom TTS uploads still rely on a later full-draft save to become referenced; image and Custom-music paths have direct association mitigation.
