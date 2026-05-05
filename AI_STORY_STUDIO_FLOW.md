# AI Story Studio (Create Your Own Story)

This document describes the workflow, state management, and user experience for the "AI Story Studio" (formerly "Create Your Own Story") mode in the Omni-Narrative Engine.

## Overview
AI Story Studio is a custom storytelling mode where users have complete freedom to write their own scenes, select AI suggestions to guide them, author character dialogues line by line, and independently generate voice acting and background music. 

Unlike Guided Mode (which steps the user through a pre-defined cinematic path using scenario templates), AI Story Studio places the creative control entirely in the user's hands.

## Mode Selection
- Located at `/story/mode`.
- Users can choose between **Guided Mode** (curated choices) and **AI Story Studio** (custom mode).
- Selecting AI Story Studio updates the global `StoryContext` with `mode: "custom"` and navigates to the `/setup` page.

## AI Story Studio Flow

The entire flow is tied together with a global Stepper:

### 1. Setup (`/setup`)
- Users define the foundation of their story: title, multiple genres, tones, total number of scenes, and the character cast.
- For each character, the user specifies a name, role, personality/tone, and a **voice style placeholder** (e.g., "Deep villain voice").
- When the setup is complete, the app creates a `CreateStoryDraft` object in `localStorage` and transitions to the Story Builder.

### 2. Story Builder (`/story-builder`)
- **Scene-by-Scene Authoring**: Users write the action and description for the current scene.
- **AI Scene Suggestions**: The app provides AI-generated suggestions for the current scene based on previous context. The user can select a suggestion to auto-fill or guide the scene description.
- **Character-wise Dialogues**: A dedicated section dynamically creates a dialogue textarea for every character present.
- **Preview Scene**: An interactive modal to preview the scene's title, description, and dialogue lines before moving on.
- **Validation**: Minimum of 2 scenes required. Users are warned if dialogues are empty before ending the story.

### 3 & 4. Audio Generation (`/audio-generation`)
- This stage handles both **Voice Audio** (Step 3) and **Background Music** (Step 4).
- Users can trigger character voice generation (mocked via Deepgram logic) and cinematic background music generation (mocked via SUNO logic).
- **Edit Warnings**: If the user goes back to edit previous scenes and modifies the story text or dialogue, warnings will instruct them to regenerate audio so that it stays in sync.

### 5. Video Preview (`/video-preview`)
- The final step. Displays a placeholder video frame.
- Summarizes the title, total scenes, and status of audio and music generation.
- **Download Video**: Currently displays a toast notice indicating that the video download will be available once the backend integration is completed.

## Data Persistence
All state for the AI Story Studio is persisted in `localStorage` under `omni_create_story_draft`. Users can safely refresh the browser or navigate backward/forward using the provided "Back" buttons without losing any scene text, dialogues, or generation status.

## Pending Backend Integrations
Currently, the AI generation logic uses hardcoded mock data and `setTimeout` delays to simulate API calls. The following integrations remain pending:
- Gemini API for AI Scene Suggestions and automated Dialogue Generation.
- Deepgram Aura API for generating voice clips from character dialogue text.
- SUNO API for generating background music tracks based on the scene's tones.
- A video composition engine (e.g., Remotion or FFmpeg) to assemble the final preview video.
