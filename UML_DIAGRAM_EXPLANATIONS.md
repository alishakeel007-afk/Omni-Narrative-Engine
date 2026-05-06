# Omni-Narrative Engine - UML Diagram Explanation Guide

This file explains every diagram in `plantuml_diagrams.md` in presentation-ready detail. Use it as a speaking guide during evaluation. It explains what each box means, why arrows exist, what data is moving, what is currently implemented, and what is planned/future.

Important note for evaluators:

- Some diagrams show the full scope architecture from the proposal, including FLUX image generation, ChromaDB memory, SUNO/background music, and coherence modules.
- The current implemented project is a Next.js web application with authentication, dashboard, guided video studio, AI Story Studio, Gemini generation, Groq fallback, Deepgram TTS, background music route, localStorage draft persistence, SQLite/Prisma auth, and video preview placeholder.
- Where a diagram contains future/planned modules, explain them as architectural design targets, not as completed production features.

---

## Figure 1: High-Level Conceptual Architecture

### What This Diagram Represents

This diagram gives the evaluator a top-level view of the whole Omni-Narrative Engine. It shows the user, frontend, API backend, external AI providers, and persistence systems.

The main purpose is to show that the project is not just a static frontend. It is a layered AI storytelling system where:

- The browser UI collects user actions.
- Next.js middleware protects private routes.
- React screens and context manage frontend state.
- API routes call external AI services securely.
- SQLite stores authenticated user data.
- localStorage stores active story/video drafts for resume and back/edit behavior.

### Main Actors and Components

#### User - Browser

This is the person using the application through a web browser. The user can:

- Visit the landing page.
- Login or signup.
- Open dashboard.
- Start guided story mode.
- Start AI Story Studio custom mode.
- Generate story, dialogues, voice, music, and preview.

The user never directly calls Gemini, Groq, Deepgram, or SUNO. That is important for security.

#### Next.js Frontend

The frontend package contains three main parts:

1. Pages and React Components
   - These are the visual screens and UI components.
   - Examples: Landing page, Auth page, Dashboard, Setup, Story Builder, Video Studio, Audio Generation, Video Preview.

2. StoryContext - Global State
   - Maintains story setup, current scene, memory timeline, and story progress.
   - Used mainly for guided/custom story state.
   - It is important because many screens need access to the same story setup and session data.

3. Next.js Middleware - Session Guard
   - Checks whether a user is authenticated before allowing access to protected pages.
   - Prevents direct access to private routes like dashboard or story studio without login.

#### Next.js API Routes

The API route layer is the server-side backend inside the Next.js app.

Routes shown:

- `/api/auth`
  - Handles login, signup, logout, session validation, password reset.

- `/api/story/generate`
  - Conceptual route for story generation.
  - In the current implementation, custom dialogue generation uses `/api/story/generate-dialogue`, and scene suggestions use `/api/story/suggest-scene`.

- `/api/video/generate`
  - Generates guided video studio story/script/scenes/dialogues.
  - Calls Gemini first.
  - Uses Groq fallback if Gemini is unavailable.

- `/api/video/tts`
  - Converts dialogue lines to speech through Deepgram.

- `/api/background-music`
  - Generates or mocks background music depending on provider configuration.

- `/api/activity`
  - Logs user activity such as story started, dialogue generated, audio generated, preview opened.

#### External AI Services

The diagram lists these:

- Google Gemini 2.5 Flash
  - Main LLM for story, scene, and dialogue generation.

- Deepgram Aura-2 TTS
  - Converts text dialogue into character voice audio.

- SUNO API
  - Intended for background music generation.
  - In current implementation, `/api/background-music` handles provider or mock fallback.

- FLUX.1-schnell
  - Planned image generation model for scene visuals.
  - It is in the architecture because the scope includes visual identity and scene images.

- ChromaDB
  - Planned vector memory store for long-term story memory/RAG.
  - Current UI has memory timeline behavior, but full ChromaDB backend memory is future work.

#### Data Persistence

Two persistence systems are shown:

1. SQLite via Prisma ORM
   - Stores registered users, hashed passwords, password reset tokens, and user activity records.

2. Browser localStorage
   - Stores active drafts and workflow state.
   - Examples:
     - Guided video studio stage and script.
     - AI Story Studio custom draft.
     - Story setup data.
     - Voice/music status.

### Why Arrows Exist

- User -> UI: User interacts with screens.
- User -> Middleware: Protected route access is checked.
- UI -> StoryContext: UI reads/writes global state.
- Middleware -> Auth API: Middleware validates session.
- StoryContext -> API routes: Frontend state triggers generation requests.
- Auth -> SQLite: Auth data is stored in database.
- Story/Video -> Gemini: LLM generation.
- TTS -> Deepgram: Voice synthesis.
- Music -> SUNO: Background music generation.
- Story -> Chroma/FLUX: Planned memory/image architecture.
- Story/Video -> localStorage: Draft persistence.

### Implementation Status

Implemented:

- Next.js frontend.
- Middleware route protection.
- Auth API with SQLite/Prisma.
- Gemini story/video generation.
- Groq fallback for Gemini failures.
- Deepgram TTS route.
- Background music route.
- localStorage persistence.

Partially implemented or planned:

- ChromaDB vector memory.
- FLUX image generation.
- Real video rendering/export.
- Full SUNO production integration if not configured.

### Likely Questions and Answers

Q: Why do you use API routes instead of calling Gemini from frontend?

A: Because API keys must remain secret. If the browser calls Gemini directly, the key can be exposed in network requests or JavaScript bundles. Server-side API routes keep keys in `.env.local`.

Q: Why use localStorage if there is a database?

A: localStorage is used for active draft continuity and fast step-by-step editing. SQLite stores authenticated account and activity data. In production, drafts can later be migrated to database-backed sessions.

Q: Why show ChromaDB and FLUX if not fully implemented?

A: They are part of the full proposed architecture and scope. The implemented prototype focuses on LLM, TTS, music route, auth, and workflow. ChromaDB and FLUX are planned backend modules.

---

## Figure 2: Layered Architecture

### What This Diagram Represents

This diagram explains the system as layers. Each layer depends on the layer below it. This makes the project easier to maintain and explain.

The layers are:

1. Presentation
2. Application State
3. Business Logic
4. API Routes
5. External Integrations
6. Persistence

### Layer-by-Layer Explanation

#### L1 - Presentation

This includes:

- LandingPage
- AuthPage
- DashboardPage
- SetupWizardPage
- ActiveStoryPage
- VideoStudioPage

These screens are responsible for what the user sees and clicks.

They do not directly store passwords or call external AI providers. Their responsibility is:

- Collect user inputs.
- Display story and generated content.
- Show forms, buttons, cards, status messages.
- Navigate between workflow stages.

#### L2 - Application State

This includes:

- StoryContext
- PersistedStoryState
- VideoStudioFlowState

This layer remembers what is happening in the application.

Examples:

- Which story mode is selected.
- Which scene is active.
- What user choices have been made.
- Whether voice needs regeneration.
- Which guided video stage is active.

This layer is necessary because the app has multi-step workflows, and data must survive navigation and refresh.

#### L3 - Business Logic

This includes:

- `storyService.ts`
- `story-engine.ts`
- `video-storage.ts`

This layer contains logic that is not purely UI and not purely API.

Examples:

- Creating initial story state.
- Counting custom choices.
- Generating local/mock scene options.
- Normalizing loaded data.
- Saving/loading guided video studio flow.

#### L4 - API Routes

This includes:

- `/api/auth`
- `/api/story/generate`
- `/api/video/generate`

API routes are the backend endpoints. They:

- Validate requests.
- Read secure environment variables.
- Call Gemini/Groq/Deepgram/music providers.
- Return JSON to the frontend.

#### L5 - External Integrations

This includes:

- Google Gemini
- Deepgram
- SUNO
- Prisma ORM

These are external or infrastructure dependencies.

Gemini/Groq generate text. Deepgram generates voice. SUNO/background music handles music. Prisma connects the application to SQLite.

#### L6 - Persistence

This includes:

- SQLite
- localStorage

SQLite persists user and auth data. localStorage persists active workflows/drafts.

### Why This Layered Style Was Chosen

It helps in:

- Separation of concerns.
- Security.
- Easier debugging.
- Future scalability.
- Replacing providers without rewriting UI.

For example, if Gemini is replaced with another LLM, only API/provider logic changes. The frontend workflow can remain almost the same.

### Likely Questions and Answers

Q: Why is Prisma under external integrations?

A: Prisma is an ORM library that connects our backend to SQLite. It acts as the database integration layer.

Q: Why not put localStorage in the database layer only?

A: localStorage is browser-side persistence, while SQLite is server-side persistence. Both are persistence mechanisms but serve different purposes.

Q: Does every frontend component talk to API routes directly?

A: Not always. Some screens use context and storage helpers first. API routes are called only for operations that need backend logic or provider keys.

---

## Figure 3: AD-01 Story Setup and Mode Selection

### What This Activity Diagram Represents

This activity diagram explains how a user starts a story. It begins at the landing page and ends when story setup data is saved and the system is ready to generate scenes.

### Step-by-Step Flow

1. User opens app landing page.
2. System checks authentication.
3. If not authenticated:
   - User is redirected to login/signup.
   - After authentication, dashboard opens.
4. If already authenticated:
   - Dashboard opens directly.
5. User clicks New Story.
6. Story Mode Selection page opens.
7. User selects:
   - Guided Mode, or
   - Custom Mode / AI Story Studio.

### Guided Mode Branch

In Guided Mode, the user configures story details through structured choices:

- Genre selection.
- Scenario selection.
- Tone and difficulty.
- Character creation.
- Attribute sliders.

This is helpful for users who do not want to write everything from scratch.

### Custom Mode Branch

In Custom Mode / AI Story Studio, the user has more control:

- Story title.
- Starting idea or scene-by-scene writing.
- Characters.
- Voice styles.
- Genres and tones.

In the current implementation, custom mode goes to AI Story Studio setup and then Story Builder.

### Initialization Steps

After mode setup:

- Module 7.12 Character Identity Tracker is initialized.
  - It keeps character name, role, traits, and voice style.

- Module 7.3 State Manager is initialized.
  - It manages active story/session state.

- StorySetupData is saved.
  - In current implementation, this is stored in localStorage through StoryContext.

### Important Current Behavior

The dashboard has a "Start New Story" path. When the user selects a mode from that fresh-start path:

- Guided Mode clears guided video studio draft and starts from Stage 1.
- Custom Mode clears AI Story Studio draft and starts from custom setup step 1.

This prevents the user from accidentally falling back into an old story.

### Likely Questions and Answers

Q: What is the difference between Guided Mode and Custom Mode?

A: Guided Mode helps users with structured AI-driven setup and generation. Custom Mode gives the user full control to write scenes and dialogues manually while still using AI assistance for suggestions/dialogues and TTS/music.

Q: Where is StorySetupData stored?

A: It is stored in browser localStorage for the current prototype and managed through StoryContext.

Q: Why initialize character tracker before scene generation?

A: Because every generated scene and dialogue needs consistent character identity: name, role, personality, and voice style.

---

## Figure 4: AD-02 Custom Story Generation Flow

### What This Activity Diagram Represents

This diagram describes the ideal custom input flow from Module 7.13. It explains how a user-written action should be validated, stored, and used to generate the next story scene.

### Current vs Planned Note

In the current implemented UI, the AI Story Studio custom flow lets the user write scenes and generate dialogues. Full ChromaDB memory validation and automated coherence checking are planned/future design elements from the scope.

### Flow Explanation

1. User is on Active Story Screen.
2. User types a custom action.
3. User submits custom input.
4. System validates:
   - Is it coherent with the current scene?
   - Does it reference known items/characters?
   - Is it logically possible in the story world?

### Validation Branches

If input is not coherent:

- User is asked to rephrase.
- This prevents nonsensical scene generation.

If input references unknown items/characters:

- User is asked to rephrase or clarify.
- Example: If the user says "use the dragon sword" but the story never introduced such an item, the system can reject or ask clarification.

If input is impossible:

- User is asked to rephrase.
- Example: A normal human instantly teleporting without any magic or technology in the story world.

If input is valid:

- It passes to Module 7.2 Narrative Engine.
- The decision is stored in ChromaDB in the full design.
- RAG retrieves past events.
- Gemini generates a scene.
- Coherence Engine checks contradictions.
- If contradictions exist, regeneration repeats.
- Valid scene is delivered to UI.

### Why This Diagram Matters

This is one of the project's unique features. It shows that the user is not locked into predefined choices. The user can write their own decision, and the system should continue the story around it.

### Likely Questions and Answers

Q: Is validation rule-based or AI-based?

A: The design supports AI-assisted validation using narrative context and memory. In the current prototype, validation is lighter and mostly UI/input based. Full semantic validation with ChromaDB/RAG is planned.

Q: Why store the custom decision?

A: Because future scenes must remember what the user did. Without storing decisions, the story may contradict past events.

Q: What happens if Gemini produces a contradiction?

A: In the full design, the Coherence Engine flags it and requests regeneration. In the current implemented system, prompt constraints and editable review reduce contradiction risk, while full automated coherence is future work.

---

## Figure 5: AD-03 Scenario-to-Movie Generation

### What This Activity Diagram Represents

This diagram explains Guided Video Studio. It maps directly to the `/video` route.

### Main Workflow

The stages are:

1. Setup
2. Story Idea
3. Story Review
4. Scenes and Dialogues
5. Audio Generation

### Existing Draft Check

The first decision checks whether an existing draft exists in localStorage.

If yes:

- The app restores `VideoStudioFlowState`.
- User continues where they left off.

If no:

- User starts from setup.

Important:

- When the user clicks Start New Story from dashboard with fresh mode, we reset this draft so the user starts from Stage 1.

### Stage 1 - Setup

User selects:

- Genres.
- Tones.
- Number of scenes.

These values guide LLM generation.

### Stage 2 - Rough Story Idea

User writes a rough idea.

Example:

"A detective discovers that every dream in the city is being broadcast from an abandoned radio tower."

This rough idea becomes the main seed for generated story.

### API Call

The frontend sends:

- scenario
- genres
- tones
- scene count
- includeAudio flag

to:

`/api/video/generate`

The backend:

- Builds a strict JSON prompt.
- Calls Gemini.
- If Gemini fails, calls Groq fallback.
- Normalizes response into `VideoGenerationResponse`.

### Stage 3 - Story Review

User sees generated story text and can edit it.

If story is edited after scenes exist:

- `scenesNeedRegeneration` becomes true.
- This warns that generated scenes/dialogues may be outdated.

### Regenerate or Accept

If regenerate:

- `/api/video/generate` is called again.

If accept:

- Accepted story is saved.
- User moves to scenes/dialogues.

### Stage 4 - Scenes and Dialogues

User sees:

- Scene titles.
- Narration.
- Visual prompts.
- Image prompts.
- Sound design.
- Character-wise dialogues.

User can edit dialogues before voice generation.

### Likely Questions and Answers

Q: Why separate story review from scenes/dialogues?

A: It lets users approve or edit the overall narrative before generating voice/audio. This avoids wasting TTS calls on a story the user may reject.

Q: What happens if Gemini is down?

A: `/api/video/generate` tries Groq fallback using `GROQ_FALLBACK_API`.

Q: Why keep draft in localStorage?

A: The flow has many stages. localStorage prevents loss during refresh/back navigation.

---

## Figure 6: AD-04 Voice and Background Music Flow

### What This Activity Diagram Represents

This diagram explains how generated or user-edited dialogues become audio, and how background music is generated afterward.

### Stage 5 - Voice Audio

The system checks whether voice was previously generated.

If voice was generated but dialogues changed:

- The app warns the user to regenerate voice.

This is important because old voice audio would no longer match edited dialogue.

### `/api/video/tts`

The frontend sends dialogue lines to the backend route:

`/api/video/tts`

The backend:

1. Maps each character to a Deepgram voice model.
2. Applies delivery adjustments based on tone.
3. Sends each dialogue line to Deepgram.
4. Receives audio responses.
5. Attaches audio URLs to dialogue lines.

### Voice Archetype Mapping

Characters are assigned voice archetypes such as:

- hero_male
- hero_female
- villain_male
- villain_female
- mentor
- narrator
- creature/robot

The point is that different characters should not all sound the same.

### Delivery Adjustments

The system modifies speech pacing based on situation.

Examples:

- Suspenseful scenes may add pauses.
- Funny scenes may sound lighter.
- Heroic scenes may sound stronger.

This helps match voice performance with scene tone.

### Stage 6 - Background Music

The frontend calls:

`/api/background-music`

If provider is configured:

- It can call SUNO/background music provider.

If not configured:

- It returns mock fallback track/status.

### Stage 7 - Video Preview

After audio/music status is ready, user opens video preview.

Current video backend status:

- Preview placeholder exists.
- Real video rendering/export is pending.

### Likely Questions and Answers

Q: Why require dialogue before voice?

A: TTS needs final text. If text changes later, the old audio becomes invalid.

Q: Why separate voice and music buttons?

A: They are different generation tasks with different APIs, costs, and outputs. Separate controls give users better control and clearer status.

Q: Is real video generated now?

A: No. The current system creates video-ready scenes and preview placeholder. Final rendering/export is future backend work.

---

## Figure 7: AD-05 Active Story Loop

### What This Activity Diagram Represents

This diagram explains the interactive story loop. It is the core loop where a user views a scene, chooses an action, and the system generates the next scene.

### Main Branches

The user can:

1. Open a modal/panel.
2. Make a story choice.

### Modal Branch

User may open:

- Story History.
- Story Memory.
- Player State.

These do not advance the story. They only let the user inspect context.

### Choice Branch

The user can choose:

- Guided option.
- Custom input.

Guided options are AI/system-provided choices.

Custom input is typed by the user.

### Custom Validation

If custom input is invalid:

- Show error toast.
- Do not advance story.

If valid:

- Continue to memory and scene generation.

### Memory and State Update

The selected choice is recorded in `memoryTimeline`.

Player state is updated:

- HP.
- Mana.
- Inventory.
- Story progress.

Adaptive difficulty checks whether the story should become easier/harder.

### RAG and Generation

The full design retrieves relevant memories from ChromaDB and sends them to Gemini.

Gemini generates a scene.

Coherence check validates it.

If contradiction found:

- Regenerate.

If valid:

- Continue.

### Parallel Generation

The diagram shows forked parallel tasks:

- Generate image with FLUX.
- Generate TTS and music.
- Store scene in ChromaDB.

This represents the full scope architecture. In the current implementation, text/dialogue/audio flows are implemented; full image and ChromaDB backend remain planned.

### Likely Questions and Answers

Q: What is the purpose of the fork?

A: It shows asynchronous orchestration. Independent tasks like image generation, audio generation, and memory storage can run in parallel to reduce waiting time.

Q: What is the difference between memoryTimeline and ChromaDB?

A: memoryTimeline is a visible/local record of user choices and story events. ChromaDB is the planned vector memory backend for semantic retrieval.

Q: Why check story completion?

A: Some stories are finite and should end cleanly after final scene/goal. The state transition avoids infinite loops.

---

## Figure 8: SD-01 Custom Story Request

### What This Sequence Diagram Represents

This sequence diagram explains how a custom user action moves through the system.

Unlike activity diagrams, sequence diagrams show time/order of messages between participants.

### Participants

- User
- Active Story Page
- Custom Input Handler
- ChromaDB Memory
- Narrative Engine
- Google Gemini API
- Coherence Engine

### Step-by-Step Message Flow

1. User types custom action.
2. Active Story Page sends text to Custom Input Handler.
3. Handler checks coherence.
4. Handler queries memory for known entities.
5. Memory returns lookup result.

### Invalid Input Branch

If input is invalid:

- Handler returns validation error.
- UI shows error toast.

No generation happens. This saves API calls and avoids broken story logic.

### Valid Input Branch

If input is valid:

1. Handler stores decision in memory.
2. Memory embeds it in vector store.
3. Memory returns top K relevant memories.
4. Handler sends prompt to Narrative Engine.
5. Narrative Engine calls Gemini.
6. Gemini returns scene text and choices.
7. Engine sends scene to Coherence Engine.
8. Coherence Engine checks against memory facts.
9. If contradiction found, engine asks Gemini to regenerate.
10. Validated scene returns to UI.
11. UI renders new scene.

### Current Implementation Note

This diagram represents the planned full custom action request pipeline. The current custom mode is AI Story Studio, where users write scenes and generate dialogues. It uses API-based dialogue generation with Gemini/Groq fallback, but full ChromaDB semantic validation is future work.

### Likely Questions and Answers

Q: What is top K memory retrieval?

A: It means retrieving the K most relevant past story memories from a vector database. For example, top 5 events related to the current scene.

Q: Why use a Coherence Engine after Gemini?

A: LLMs can hallucinate or contradict earlier facts. A coherence check reduces contradictions before output is shown.

Q: Why not trust Gemini directly?

A: Gemini is creative but not guaranteed consistent. The engine wraps it with validation, memory, and regeneration logic.

---

## Figure 9: SD-02 Video Generation and TTS

### What This Sequence Diagram Represents

This diagram maps closely to the implemented Guided Video Studio.

It explains:

- How the user generates a script.
- How the script is normalized.
- How voice audio is generated.
- How results are saved.

### Participants

- User
- Video Studio Page
- localStorage
- `/api/video/generate`
- Gemini API
- `/api/video/tts`
- Deepgram API

### Story Generation Sequence

1. User selects genre and tone.
2. User writes story idea.
3. User clicks Generate Story.
4. Video Studio Page posts to `/api/video/generate`.
5. Backend sends structured prompt to Gemini.
6. Gemini returns scenes and character voices.
7. Backend normalizes response.
8. Backend returns normalized script.
9. Video Studio saves `VideoStudioFlowState` to localStorage.

### Important Current Enhancement

If Gemini fails with 503/high demand:

- `/api/video/generate` calls Groq fallback.
- Frontend still receives a normalized script if fallback succeeds.

This is not drawn in the original diagram but is implemented now.

### TTS Sequence

1. User accepts story.
2. User clicks Generate Voice.
3. Video Studio posts script/dialogues to `/api/video/tts`.
4. TTS route maps archetypes to Deepgram voice models.
5. For each dialogue line:
   - Backend sends text and model to Deepgram.
   - Deepgram returns audio response.
6. Backend returns voiceResult.
7. Video Studio saves voiceResult to localStorage.
8. User can play audio in UI.

### Why normalizeVideoScript Exists

LLM output may vary slightly. Normalization ensures:

- Required fields exist.
- Scenes are numbered.
- Dialogue IDs exist.
- Missing fields have safe fallback values.
- UI receives consistent data shape.

### Likely Questions and Answers

Q: Why is localStorage used after generation?

A: Because the user may go back, refresh, edit dialogue, regenerate voice, or continue later. localStorage keeps generated script and stage.

Q: How are different voices assigned?

A: The backend maps character role/delivery/archetype to Deepgram voice models and tries to keep each character's voice profile stable.

Q: Is TTS called from frontend?

A: No. The frontend calls our backend route. The backend calls Deepgram securely.

---

## Figure 10: SD-03 Background Music Request

### What This Sequence Diagram Represents

This diagram explains the background music generation sequence.

### Participants

- User
- Video Studio Page
- localStorage
- `/api/background-music`
- SUNO API
- Mock Provider

### Sequence

1. User clicks Generate Music.
2. Video Studio sends mood and genre prompt to `/api/background-music`.
3. Backend checks if SUNO/provider is configured.

If configured:

- Backend calls SUNO API.
- SUNO returns track URL.

If not configured:

- Backend returns mock track/status.

4. Backend returns track URL and status.
5. Video Studio saves result to localStorage.
6. User sees playback UI.
7. User clicks Preview Video.
8. App navigates to `/video-preview`.

### Why Mock Provider Exists

The project must remain demoable even when:

- Provider key is not configured.
- Music API has downtime.
- API usage limits are reached.

Mock fallback allows the workflow to continue.

### Current Custom Mode Note

AI Story Studio also uses audio generation and background music status through `/audio-generation`. Custom preview opens `/video-preview?mode=custom`, so back buttons return to custom pages.

### Likely Questions and Answers

Q: Why generate voice before music in custom mode?

A: The workflow requires voice first so final audio state is complete before music and preview. It also avoids creating final preview before core dialogue audio exists.

Q: Does the system create a downloadable video now?

A: No. It creates a video preview placeholder and saves all needed story/audio metadata. Download becomes available after video backend integration.

---

## Figure 11: SD-04 User Authentication

### What This Sequence Diagram Represents

This diagram explains login, route protection, and password reset.

### Participants

- User
- Browser
- Middleware
- `/api/auth`
- Prisma ORM
- SQLite DB

### Protected Route Flow

1. User visits `/dashboard`.
2. Browser sends request.
3. Middleware checks session cookie.

If no cookie:

- Middleware redirects to `/auth`.

If valid cookie:

- Middleware allows access.

### Login Flow

1. User submits email/password.
2. Browser posts to `/api/auth/login`.
3. API asks Prisma to find the user by email.
4. Prisma queries SQLite.
5. SQLite returns user record.
6. API compares password using bcrypt.

If valid:

- API returns 200 OK.
- Cookie/session is set.
- Dashboard renders.

If invalid:

- API returns 401.
- UI shows error.

### Password Reset Flow

Optional branch:

1. User submits forgot password.
2. API creates reset token.
3. Token is stored hashed/controlled.
4. User opens reset link.
5. New password is hashed and saved.

### Security Points

- Plain passwords are never stored.
- Passwords are verified with bcrypt compare.
- Middleware protects private routes.
- JWT/session cookies control access.
- Database access is through Prisma, not raw browser access.

### Likely Questions and Answers

Q: Why use bcrypt?

A: bcrypt is a one-way password hashing algorithm. Even if the database is exposed, plaintext passwords are not stored.

Q: Why middleware?

A: Middleware checks protected routes before page rendering, preventing unauthenticated access.

Q: Why Prisma?

A: Prisma provides typed database access, schema management, and safer queries than manually building SQL strings.

---

## Figure 12: STD-01 Story Session State Transition

### What This State Diagram Represents

This diagram shows the states a story session can pass through.

### States

#### UNAUTHENTICATED

User has no valid session.

The only valid transition is login success.

#### DASHBOARD

User is authenticated and sees the command center.

From here user can:

- Continue last story.
- Start new story.
- Open video studio.
- Open AI Story Studio.

#### MODE_SELECTION

User chooses Guided or Custom mode.

#### SETUP_WIZARD

User configures story details.

#### STORY_INITIALIZED

Setup is complete and initial story state is created.

#### SCENE_ACTIVE

The user is inside an active story scene.

Nested states:

- Idle
- Viewing Modal

User can inspect history/memory/player state without leaving the active scene.

#### PROCESSING_INPUT

User submitted a choice or custom text and the system is generating/updating.

#### SCENE_ERROR

API or validation failed.

User may retry or abort to dashboard.

#### STORY_COMPLETE

Final story state.

### Why This Diagram Matters

It proves the system has controlled state transitions, not random page jumps.

### Likely Questions and Answers

Q: Why include SCENE_ERROR?

A: AI APIs can fail. The system must represent errors and allow retry or abort.

Q: Why nested states under SCENE_ACTIVE?

A: Opening memory/history/player state does not mean leaving the scene. It is a sub-state of the same active scene.

---

## Figure 13: STD-02 Video Studio State Transition

### What This State Diagram Represents

This is the exact state machine for Guided Video Studio.

### States and Transitions

#### SETUP

User selects genre, tone, and scene count.

Transition:

- Continue -> STORY_IDEA

#### STORY_IDEA

User writes rough story idea.

Transition:

- Generate -> GENERATING_STORY

#### GENERATING_STORY

API call is active.

Transition:

- Success -> STORY_REVIEW
- Failure -> error message and user remains able to retry.

#### STORY_REVIEW

User reviews generated story.

Transitions:

- Regenerate -> GENERATING_STORY
- Accept -> SCENES

#### SCENES

User reviews and edits generated scenes/dialogues.

Transitions:

- Regenerate -> GENERATING_SCENES
- Continue -> VOICE
- Edit dialogues -> SCENES_OUTDATED

#### SCENES_OUTDATED

Represents that changes may require regeneration or audio update.

#### VOICE

User can generate voice.

Transition:

- Generate Voice -> GENERATING_VOICE

#### GENERATING_VOICE

Deepgram call is active.

Transition:

- Success -> VOICE_READY

#### VOICE_READY

Audio exists.

Transition:

- Continue -> MUSIC

#### MUSIC

User generates background music.

Transition:

- Generate Music -> GENERATING_MUSIC

#### MUSIC_READY

Music exists.

Transition:

- Preview Video -> PREVIEW

#### PREVIEW

Video preview placeholder.

Back routes can return to setup/music/scenes depending on button.

### Important Implementation Detail

This state is saved in `VideoStudioFlowState` in localStorage. That is why refresh does not lose the stage.

### Likely Questions and Answers

Q: Why have separate generating states?

A: They represent asynchronous API calls and allow loading indicators, disabled buttons, and error handling.

Q: What happens if dialogue changes after voice is ready?

A: The system marks voice as needing regeneration so audio does not mismatch edited text.

---

## Figure 14: STD-03 Authentication State Transition

### What This State Diagram Represents

This diagram explains authentication states from login/signup/password reset to dashboard.

### States

- UNAUTHENTICATED
- LOGIN_FORM
- AUTHENTICATING
- SIGNUP_FORM
- CREATING_ACCOUNT
- FORGOT_PASSWORD
- RESET_EMAIL_SENT
- RESET_PASSWORD_FORM
- AUTHENTICATED
- DASHBOARD

### Main Login Flow

1. Unauthenticated user visits auth page.
2. Login form appears.
3. User submits credentials.
4. System enters AUTHENTICATING.
5. If valid, user becomes AUTHENTICATED.
6. User is redirected to dashboard.
7. Logout returns user to UNAUTHENTICATED.

### Signup Flow

1. User clicks signup.
2. Signup form appears.
3. User submits details.
4. Account is created.
5. User becomes authenticated or is routed to login depending on implementation.

### Password Reset Flow

1. User clicks forgot password.
2. Reset email/token flow starts.
3. User opens reset password form.
4. New password is saved.
5. User returns to authenticated/login flow.

### Likely Questions and Answers

Q: What causes session expired?

A: JWT/cookie expiration, logout, or invalid token.

Q: Why separate AUTHENTICATING and AUTHENTICATED?

A: AUTHENTICATING represents the temporary API call state. AUTHENTICATED means validation succeeded.

---

## Figure 15: ER Diagram: Data Design

### What This ER Diagram Represents

This diagram shows the logical data entities in the system.

It mixes two categories:

1. Server database entities.
2. Application/domain entities.

### Database Entities

#### User

Fields:

- id
- name
- email
- passwordHash
- createdAt

Purpose:

- Stores registered users.
- `passwordHash` stores hashed password, not plaintext.

#### UserActivity

Fields:

- id
- userId
- activityType
- metadata

Purpose:

- Tracks user actions.
- Examples: story_started, dialogue_generated, audio_generated, video_previewed.

Relationship:

- One User has many UserActivity records.

#### PasswordResetToken

Fields:

- id
- userId
- tokenHash
- expiresAt

Purpose:

- Supports password reset.
- Token is associated with a user and expires after a limited time.

Relationship:

- One User can have many reset tokens.

### Domain/Application Entities

These may be stored in localStorage in the current prototype but are shown as data design entities:

#### PersistedStoryState

Fields:

- currentSceneIndex
- isLoading

Purpose:

- Represents active story progress.

#### StorySetupData

Fields:

- genre
- mode

Purpose:

- Stores user's selected story setup.

#### StoryScene

Fields:

- sceneNumber
- text

Purpose:

- Represents a generated or active story scene.

#### MemoryItem

Fields:

- sceneNumber
- userChoice

Purpose:

- Stores user decisions and story memory.

### Relationships

- User ||--o{ UserActivity
  - One user can have many activity records.

- User ||--o{ PasswordResetToken
  - One user can request multiple password reset tokens over time.

- PersistedStoryState ||--|| StorySetupData
  - One story state has one setup.

- PersistedStoryState ||--o{ StoryScene
  - One story state can have many scenes.

- PersistedStoryState ||--o{ MemoryItem
  - One story state can have many memory records.

### Important Clarification

In current implementation:

- User, Activity, PasswordResetToken belong to actual database design.
- Story setup, story state, scenes, and memory are primarily persisted in localStorage for prototype draft continuity.

Future production:

- These story entities can be moved into SQLite/PostgreSQL tables.

### Likely Questions and Answers

Q: Why are localStorage entities in ER diagram?

A: They are logical data entities. ER diagram documents domain data, even if current persistence is browser storage. Production can map them to database tables.

Q: Why store metadata as string?

A: Activity metadata can vary by event type, so JSON/string metadata gives flexibility.

Q: Why one setup per story state?

A: A story session is generated under one setup: mode, genre, tone, characters, and scenario.

---

## Figure 16: Class Diagram

### What This Class Diagram Represents

This diagram shows the main TypeScript/domain classes and relationships used in the storytelling system.

It explains application-level objects rather than database tables.

### Classes

#### StorySetupData

Fields:

- characterName
- genre
- mode
- difficulty

In actual project, StorySetupData also includes:

- genres
- moods
- characters
- scenario title/description
- numberOfScenes
- character attributes
- startingIdea
- storyTitle

Purpose:

- Stores the user's story configuration.

#### PersistedStoryState

Fields:

- currentSceneIndex
- isLoading
- lastSavedAt

In actual project, it also includes:

- currentScene
- pastScenes
- memoryTimeline
- selectedChoice
- selectedChoiceType
- healthStatus
- inventory
- customChoiceInput

Purpose:

- Tracks active guided story state.

#### StoryScene

Fields:

- sceneNumber
- title
- text
- location
- options

Purpose:

- Represents a scene in the active story loop.
- Options are guided choices.

#### MemoryItem

Fields:

- sceneNumber
- userChoice
- choiceType
- timestamp

Purpose:

- Records what user did and when.

#### VideoStudioFlowState

Fields:

- stage
- sceneCount
- scenesNeedRegeneration

In actual project, it also includes:

- roughIdea
- generatedStory
- acceptedStory
- script
- voiceResult
- music
- videoOutdated
- voiceNeedsRegeneration

Purpose:

- Controls Guided Video Studio multi-step workflow.

#### MovieScene

Fields:

- sceneNumber
- narration
- imagePrompt

In actual project, it also includes:

- title
- location
- mood
- sceneGenre
- sceneTone
- soundDesign
- dialogues
- directorNotes

Purpose:

- Represents one generated film scene.

#### MovieDialogueLine

Fields:

- character
- line
- audioUrl

In actual project, it also includes:

- id
- delivery
- voiceProfile
- audioMimeType
- audioError

Purpose:

- Represents one character's spoken dialogue line and optional generated audio.

### Relationships

#### PersistedStoryState *-- StorySetupData

Composition:

- Story state owns one setup.
- Without setup, story state has no context.

#### PersistedStoryState *-- StoryScene

Composition:

- Story state contains one or many scenes.
- Scenes are part of the story session.

#### PersistedStoryState *-- MemoryItem

Composition:

- Story state contains zero or many memory entries.
- Memory entries grow as user makes choices.

#### VideoStudioFlowState *-- MovieScene

Composition:

- Video studio flow contains generated movie scenes.
- These scenes belong to the generated script.

#### MovieScene *-- MovieDialogueLine

Composition:

- Each movie scene owns one or more dialogue lines.
- Dialogues are generated/edited as part of that scene.

### Likely Questions and Answers

Q: Why composition instead of simple association?

A: These child objects belong strongly to the parent workflow. A dialogue line does not make sense without its scene; a scene does not make sense without its story/video flow.

Q: Why have StoryScene and MovieScene separately?

A: StoryScene is for interactive story/game-like scenes. MovieScene is for cinematic video-ready script scenes with narration, prompts, sound design, and voice metadata.

Q: Why separate PersistedStoryState and VideoStudioFlowState?

A: They support different workflows. PersistedStoryState supports active branching story. VideoStudioFlowState supports staged guided video generation.

---

## Cross-Diagram Concepts Evaluators May Ask About

### 1. Guided Mode vs AI Story Studio

Guided Mode:

- More structured.
- User gives scenario/idea.
- Gemini generates full story, scenes, dialogues, prompts.
- User reviews and edits.
- Then voice, music, preview.

AI Story Studio:

- User controls story manually scene by scene.
- User defines title, genres, tones, characters.
- User writes scene descriptions.
- AI can suggest scenes or generate dialogue.
- User edits dialogues.
- Then voice, music, preview.

### 2. Gemini vs Groq

Gemini:

- Primary model provider.
- Used for story generation and dialogue generation.

Groq:

- Fallback provider.
- Used when Gemini returns errors like 503 high demand.
- Uses `GROQ_FALLBACK_API`.

Why fallback matters:

- AI provider availability is unstable.
- A final year demo must not fail just because Gemini is overloaded.

### 3. Deepgram TTS

Deepgram:

- Converts text dialogue into speech.
- Backend sends text and model.
- Response is audio.

The project supports multiple voices by assigning different voice models/archetypes to characters.

### 4. localStorage vs SQLite

SQLite:

- Server-side database.
- Stores user accounts, password reset tokens, activity logs.

localStorage:

- Browser-side draft storage.
- Stores active story/video workflows.
- Allows refresh/back/edit without losing current draft.

Production improvement:

- Move drafts into database per authenticated user.

### 5. Why Video Preview Is Placeholder

The project currently creates:

- Story.
- Scenes.
- Dialogues.
- Voice audio.
- Background music status.
- Video-ready structure.

But real video rendering requires an additional backend composition engine such as:

- FFmpeg.
- Remotion.
- MoviePy.

So the preview page is intentionally a placeholder until backend integration.

### 6. Regeneration Warnings

If user edits story after scenes:

- Scenes may be outdated.

If user edits dialogues after voice:

- Voice audio is outdated.

If audio/music changes after preview:

- Preview may be outdated.

This protects consistency between text, voice, music, and preview.

### 7. Why So Many States?

Because AI generation is asynchronous and multi-step.

States help manage:

- Loading.
- Retry.
- Error handling.
- Back/edit.
- Regeneration.
- Stage indicator.

Without explicit states, the app can easily lose user work or route to the wrong workflow.

---

## Short Presentation Script

If asked to explain the diagrams quickly:

"Our system is designed as a layered client-server AI storytelling platform. The frontend is built in Next.js and React, while server-side API routes handle authentication and all AI provider calls. The user can choose Guided Mode or AI Story Studio. Guided Mode generates full cinematic stories from a rough idea, while AI Story Studio lets users write scenes and dialogues manually with optional AI help. Gemini is the primary LLM, and Groq is used as fallback if Gemini is unavailable. Deepgram converts dialogues into character voices, and the background music route handles music or fallback output. SQLite with Prisma stores authentication and activity data, while localStorage persists active drafts so back/edit and refresh do not lose work. The diagrams also include planned modules like FLUX image generation and ChromaDB long-term memory, which are part of the full proposed architecture."

---

## One-Line Answers for Common Evaluator Questions

Q: What is the core innovation?

A: Combining guided choices, custom scene authoring, AI dialogue generation, multi-character TTS, music, memory, and video-ready preview in one storytelling workflow.

Q: Why use Groq fallback?

A: To keep generation working when Gemini returns high-demand or unavailable errors.

Q: What is stored in the database?

A: User authentication data, password reset tokens, and user activity records.

Q: What is stored in localStorage?

A: Active story drafts, guided video studio state, custom story scenes, dialogue edits, audio/music status, and current workflow stage.

Q: Is video generation complete?

A: Not yet. The system produces video-ready scenes and preview placeholder; real rendering/export is future backend work.

Q: Why separate Guided and Custom workflows?

A: Guided Mode supports beginners with AI structure, while Custom Mode gives creative users full control.

Q: What happens if the user edits dialogue after audio?

A: The system marks voice audio as needing regeneration so audio stays consistent with text.

Q: Why middleware?

A: Middleware protects private pages before rendering and redirects unauthenticated users.

Q: Why use Prisma?

A: Prisma gives typed, structured, safer database access for auth and activity data.

Q: What are future modules?

A: Full ChromaDB vector memory, FLUX image generation, stronger coherence engine, adaptive difficulty backend, and real video rendering/export.
