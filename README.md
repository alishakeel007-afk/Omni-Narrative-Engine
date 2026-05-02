# Omni-Narrative Engine

A cinematic Next.js frontend for an AI-powered multimedia storytelling platform.

## Stack

- Next.js App Router
- React
- Tailwind CSS
- TypeScript

## Pages

- `/` Landing page
- `/setup` Story setup wizard
- `/story` Main interactive story experience
- `/video` Scenario-to-movie module with Gemini story generation and dialogue voice output
- `/dashboard` User dashboard

## Key Frontend Features

- Guided story mode and custom story mode
- Hybrid choice flow with AI options plus free-text user action
- Story memory timeline modal
- Character consistency panel
- Generated media panel
- Backend API route for Gemini scene generation and multi-character Deepgram dialogue voices
- Responsive glassmorphism UI with cinematic dark styling

## Video Voice Casting

The `/video` module asks Gemini to label each dialogue line with a character voice archetype
such as `hero_male`, `hero_female`, `villain_male`, `villain_female`, `mentor_male`,
`mentor_female`, `young_male`, `young_female`, or `creature_robot`.
The backend maps those archetypes to distinct Deepgram Aura-2 voice models and keeps the
same character on the same voice across scenes.
Users can select multiple genres and multiple tones. Gemini assigns each scene its own
`sceneGenre` and `sceneTone`, while each dialogue line receives a situation-specific
`delivery` and `voiceTone`. The backend lightly adjusts punctuation and pauses before
Deepgram synthesis so suspenseful lines, funny lines, emotional lines, and heroic lines
have different pacing while preserving the character's base voice identity.

## AI API Keys

The backend reads these server-side values from `.env.local`:

```bash
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-2.5-flash
DEEPGRAM_TTS_API_KEY=your_deepgram_key
DEEPGRAM_TTS_MODEL=aura-2-thalia-en
```

For compatibility with the current prototype, the API route also accepts the existing
`.env.example` labels `gemini llm api key` and `deepgramtts`.

## Run Locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
