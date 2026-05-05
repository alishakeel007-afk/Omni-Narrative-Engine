# Video Studio Flow

This document describes the Guided Video Studio workflow at `/video`.

## Route Flow

Video Studio
-> Setup
-> Story Idea
-> Story Review
-> Scenes & Dialogues
-> Voice Audio
-> Background Music
-> Video Preview

The flow is persistent. Refreshing the page keeps the current stage and saved work.

## Stage 1: Setup

The user selects:

- Genre palette
- Emotional tone palette
- Number of scenes

Button:

- **Continue to Story Idea**

No back button is shown because this is the first stage.

## Stage 2: Rough Story Idea

The user writes a rough story idea.

Buttons:

- **Back to Setup**
- **Generate Story with Gemini**

Going back keeps the selected genre, tone, scene count, and rough idea.

## Stage 3: Generated Story Review

Gemini generation uses the existing `/api/video/generate` route. The app converts the generated title, logline, and scene narration into an editable story review.

Buttons:

- **Back to Story Idea**
- **Regenerate Story**
- **Accept Story / Continue to Scenes**

If the user edits the story after scenes already exist, the UI warns that scenes and dialogues should be regenerated.

## Stage 4: Scenes & Dialogues

This stage shows Gemini-generated scenes, narration, visual prompts, sound design, and character-wise dialogues.

Buttons:

- **Back to Story Review**
- **Regenerate Scenes & Dialogues**
- **Continue to Audio Generation**

Regeneration calls the existing Gemini generation endpoint again using the latest accepted story.

If dialogue changes after voice audio has already been generated, the UI warns:

`Dialogues changed. Please regenerate voice audio.`

## Stage 5: Voice Audio

Voice generation uses the existing Deepgram route:

`/api/video/tts`

Buttons:

- **Back to Edit Dialogues**
- **Generate Voice**
- **Regenerate Voice**
- **Continue to Background Music**

Generated audio and status are saved in localStorage.

## Stage 6: Background Music

Background music generation uses the existing route:

`/api/background-music`

This route can proxy to the configured background music/SUNO provider through environment variables. If no provider is configured, it returns the existing mock track fallback.

Buttons:

- **Back to Audio Generation**
- **Generate Background Music**
- **Regenerate Background Music**
- **Preview Video**

Generated music status and track metadata are saved in localStorage.

## Stage 7: Video Preview

The video preview page is available at:

`/video-preview`

It shows:

- Large centered video frame/card
- Story title
- Number of scenes
- Voice audio status
- Background music status
- Scene list

Buttons:

- **Download Video**
- **Back to Edit Dialogues**
- **Back to Audio & Music**
- **Back to Video Studio**

Real video backend generation is not implemented yet. Download currently shows:

`Video download will be available after backend integration.`

## Persistence

The main flow is stored in localStorage:

`omni-narrative-engine-video-studio-flow`

The flow tracks:

- Current stage
- Selected genre
- Selected tone
- Number of scenes
- Rough story idea
- Generated story
- Accepted/edited story
- Generated scenes
- Character dialogues
- Deepgram voice generation result
- Background music result
- Outdated/regeneration warnings

Existing compatibility keys remain:

- `omni-narrative-engine-video-draft`
- `omni-narrative-engine-video-voice-result`

## Completed

- Back/Edit controls for all major stages
- Stage indicator
- Persistent state
- Gemini story/scenes regeneration through existing API
- Deepgram voice generation through existing API
- Background music generation through existing API
- Preview page with return controls
- User-friendly outdated warnings

## Pending Backend Work

- Real video rendering backend
- Final video download/export
- Production SUNO provider configuration if not already connected through environment variables
