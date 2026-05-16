# Omni-Narrative Engine — PlantUML Diagrams

You can render these diagrams using any PlantUML viewer, such as [PlantText](https://www.planttext.com/) or the PlantUML extension for VS Code.

---

## Figure 1: High-Level Conceptual Architecture

```plantuml
@startuml
skinparam componentStyle uml2
skinparam monochrome true
skinparam linetype ortho

actor "User - Browser" as User

package "Next.js 14 Frontend" {
    [Pages and React Components] as UI
    [StoryContext - Global State] as CTX
    [Next.js Middleware - Session Guard] as MW
}

package "Next.js API Routes" {
    [/api/auth] as AUTH
    [/api/story/generate] as STORY
    [/api/video/generate] as VIDEO
    [/api/video/tts] as TTS
    [/api/background-music] as MUSIC
    [/api/activity] as ACT
}

package "External AI Services" {
    [Google Gemini 2.5 Flash] as GEMINI
    [Deepgram Aura-2 TTS] as DEEPGRAM
    [SUNO API] as SUNO
    [FLUX.1-schnell] as FLUX
    [ChromaDB] as CHROMA
}

package "Data Persistence" {
    database "SQLite via Prisma ORM" as SQLITE
    database "Browser localStorage" as LS
}

User --> UI
User --> MW
UI --> CTX
MW --> AUTH
CTX --> STORY
CTX --> VIDEO
CTX --> TTS
CTX --> MUSIC

AUTH --> SQLITE
STORY --> GEMINI
VIDEO --> GEMINI
TTS --> DEEPGRAM
MUSIC --> SUNO
STORY --> CHROMA
STORY --> FLUX

STORY --> LS
VIDEO --> LS
@enduml
```

---

## Figure 2: Layered Architecture

```plantuml
@startuml
skinparam componentStyle uml2
skinparam monochrome true
skinparam linetype ortho
left to right direction

package "L1 — Presentation" {
    [LandingPage]
    [AuthPage]
    [DashboardPage]
    [SetupWizardPage]
    [ActiveStoryPage]
    [VideoStudioPage]
}

package "L2 — Application State" {
    [StoryContext]
    [PersistedStoryState]
    [VideoStudioFlowState]
}

package "L3 — Business Logic" {
    [storyService.ts]
    [story-engine.ts]
    [video-storage.ts]
}

package "L4 — API Routes" {
    [/api/auth]
    [/api/story/generate]
    [/api/video/generate]
}

package "L5 — External Integrations" {
    [Google Gemini]
    [Deepgram]
    [SUNO]
    [Prisma ORM]
}

package "L6 — Persistence" {
    database "SQLite"
    database "localStorage"
}

"L1 — Presentation" --> "L2 — Application State"
"L2 — Application State" --> "L3 — Business Logic"
"L3 — Business Logic" --> "L4 — API Routes"
"L4 — API Routes" --> "L5 — External Integrations"
"L5 — External Integrations" --> "L6 — Persistence"
@enduml
```

---

## Figure 3: AD-01 Story Setup and Mode Selection

```plantuml
@startuml
skinparam monochrome true
skinparam linetype ortho

start
:User Opens App\nLanding Page;

if (Authenticated?) then (no)
  :Redirect to /auth;
  :Login or Signup;
  :Dashboard Page;
else (yes)
  :Dashboard Page;
endif

:Click New Story;
:Story Mode Selection Page;

if (Which Mode?) then (Guided Mode)
  :Step 1 - Genre Selection;
  :Step 2 - Scenario Selection;
  :Step 3 - Tone and Difficulty;
  :Step 4 - Character Creation;
  :Set Attributes via Sliders;
else (Custom Mode)
  :Type Story Title;
  :Write Starting Idea;
  :Define Characters and Voices;
endif

:Initialize Module 7.12\nCharacter Identity Tracker;
:Initialize Module 7.3\nState Manager;
:Save StorySetupData to localStorage;
:Proceed to Scene Generation;
stop
@enduml
```

---

## Figure 4: AD-02 Custom Story Generation Flow

```plantuml
@startuml
skinparam monochrome true
skinparam linetype ortho

start
:User on Active Story Screen;
:User Types Custom Action;
:Submit Custom Input;

if (Coherent with Current Scene?) then (no)
  :Prompt User to Rephrase;
  stop
else (yes)
  if (References Known Items/Characters?) then (no)
    :Prompt User to Rephrase;
    stop
  else (yes)
    if (Logically Possible in Story World?) then (no)
      :Prompt User to Rephrase;
      stop
    else (yes)
      :Pass to Module 7.2 Narrative Engine;
      :Store Custom Decision in ChromaDB;
      :RAG Retrieval of Past Events;

      repeat
        :Gemini LLM Generates Scene;
        :Coherence Engine\nContradiction Detection;
      repeat while (Contradiction Found?) is (yes)
      ->no;

      :Deliver Validated Scene to UI;
      :Update Story Progress Path;
      stop
    endif
  endif
endif
@enduml
```

---

## Figure 5: AD-03 Scenario-to-Movie Generation

```plantuml
@startuml
skinparam monochrome true
skinparam linetype ortho

start
:Navigate to /video;
if (Existing Draft in localStorage?) then (yes)
  :Restore VideoStudioFlowState;
else (no)
  :Stage 1 - Setup (Genre, Tone, Scenes);
  :Stage 2 - Write Rough Story Idea;
  :POST /api/video/generate;
  :Gemini Generates Title, Logline, Scenes;
endif

:Stage 3 - Story Review;
if (Story Text Edited?) then (yes)
  :Flag scenesNeedRegeneration = true;
else (no)
endif

if (Regenerate or Accept?) then (Regenerate)
  :POST /api/video/generate;
  stop
else (Accept)
  :Accept Story;
  :Stage 4 - Scenes and Dialogues;

  if (Regenerate Scenes?) then (yes)
    :POST /api/video/generate using acceptedStory;
    :Stage 4 - Scenes and Dialogues;
  else (no)
  endif

  :Continue to Audio Generation;
  stop
endif
@enduml
```

---

## Figure 6: AD-04 Voice and Background Music Flow

```plantuml
@startuml
skinparam monochrome true
skinparam linetype ortho

start
:Stage 5 - Voice Audio;

if (Voice Previously Generated?) then (yes - dialogues changed)
  :Show Warning\nRegenerate Voice;
else (no)
endif

:POST /api/video/tts;
:Map Archetypes to Deepgram Models;
:Apply Delivery Adjustments;
:Deepgram Synthesizes Each Line;
:Save voiceResult to localStorage;
:Display Audio Playback;

:Stage 6 - Background Music;
:POST /api/background-music;

if (SUNO Provider Configured?) then (yes)
  :Call SUNO API;
else (no)
  :Return Mock Track Fallback;
endif

:Save Music Track URL;
:Stage 7 - Video Preview;
stop
@enduml
```

---

## Figure 7: AD-05 Active Story Loop

```plantuml
@startuml
skinparam monochrome true
skinparam linetype ortho

start
:Active Story Screen;

if (Action Type) then (Open Modal)
  if (Which Modal?) then (History)
    :Story History Modal;
  elseif (Memory)
    :Story Memory Modal;
  else (Player State)
    :Player State Panel;
  endif
  :Close Modal;
  stop
else (Make Choice)
  if (Input Type?) then (Guided)
    :Click Choice A/B/C/D;
  else (Custom)
    :Type Custom Action;
    :Validate Input;
    if (Valid?) then (no)
      :Show Error Toast;
      stop
    else (yes)
    endif
  endif

  :Record Choice in memoryTimeline;
  :Update Player State (HP/Mana/Inv);
  :Adaptive Difficulty Check;
  :Set isLoading = true;
  :RAG Retrieval from ChromaDB;

  repeat
    :Gemini Generates Scene;
    :Coherence Check;
  repeat while (Contradiction Found?) is (yes)
  ->no;

  fork
    :Generate Image (FLUX);
  fork again
    :Generate TTS & Music;
  fork again
    :Store Scene in ChromaDB;
  end fork

  :Render New Scene to UI;

  if (Story Complete?) then (yes)
    :Story Complete Screen;
    stop
  else (no)
    :Active Story Screen;
    stop
  endif
endif
@enduml
```

---

## Figure 8: SD-01 Custom Story Request

```plantuml
@startuml
skinparam monochrome true
skinparam linetype ortho

actor User
participant "Active Story Page" as UI
participant "Custom Input Handler" as Handler
participant "ChromaDB Memory" as Memory
participant "Narrative Engine" as Engine
participant "Google Gemini API" as Gemini
participant "Coherence Engine" as Coherence

User -> UI: Type custom action
UI -> Handler: Submit text
Handler -> Handler: Check coherence
Handler -> Memory: Query known entities
Memory --> Handler: Lookup result

alt Input Invalid
    Handler --> UI: Validation error
    UI --> User: Show error toast
else Input Valid
    Handler -> Memory: Store decision
    Memory -> Memory: Embed in vector store
    Memory --> Handler: Top K relevant memories
    Handler -> Engine: Prompt with input + context
    Engine -> Gemini: Generate scene
    Gemini --> Engine: Scene text + choices
    Engine -> Coherence: Send for contradiction check
    Coherence -> Memory: Cross-reference facts

    opt Contradiction Found
        Coherence -> Engine: Flag contradiction
        Engine -> Gemini: Regenerate with correction
        Gemini --> Engine: Corrected scene
    end

    Coherence --> UI: Validated scene
    UI --> User: Render new scene
end
@enduml
```

---

## Figure 9: SD-02 Video Generation and TTS

```plantuml
@startuml
skinparam monochrome true
skinparam linetype ortho

actor User
participant "Video Studio Page" as VS
database "localStorage" as LS
participant "/api/video/generate" as VG
participant "Gemini API" as Gemini
participant "/api/video/tts" as TTS
participant "Deepgram API" as Deepgram

User -> VS: Select genre, tone, write idea
User -> VS: Click Generate Story
VS -> VG: POST /generate
VG -> Gemini: Structured generation prompt
Gemini --> VG: Scenes & character voices
VG -> VG: normalizeVideoScript()
VG --> VS: Normalized script
VS -> LS: saveVideoStudioFlow()

User -> VS: Accept Story
User -> VS: Click Generate Voice
VS -> TTS: POST /tts
TTS -> TTS: Map archetypes to voice models

loop Each dialogue line
    TTS -> Deepgram: POST text & model
    Deepgram --> TTS: Audio response
end

TTS --> VS: voiceResult (Audio URLs)
VS -> LS: Save voiceResult
VS --> User: Audio playback UI
@enduml
```

---

## Figure 10: SD-03 Background Music Request

```plantuml
@startuml
skinparam monochrome true

actor User
participant "Video Studio Page" as VS
database "localStorage" as LS
participant "/api/background-music" as BM
participant "SUNO API" as SUNO
participant "Mock Provider" as Mock

User -> VS: Click Generate Music
VS -> BM: POST with mood & genre

alt SUNO Configured
    BM -> SUNO: POST prompt
    SUNO --> BM: Track URL
else Not Configured
    BM -> Mock: Load fallback
    Mock --> BM: Mock URL
end

BM --> VS: Track URL & status
VS -> LS: Save to state
VS --> User: Music playback UI

User -> VS: Click Preview Video
VS --> User: Navigate to /video-preview
@enduml
```

---

## Figure 11: SD-04 User Authentication

```plantuml
@startuml
skinparam monochrome true

actor User
participant "Browser" as B
participant "Middleware" as MW
participant "/api/auth" as API
participant "Prisma ORM" as P
database "SQLite DB" as DB

User -> B: Visit /dashboard
B -> MW: GET /dashboard
MW -> MW: Check session cookie

alt No Cookie
    MW --> B: Redirect to /auth
    User -> B: Submit login
    B -> API: POST /login
    API -> P: findUnique()
    P -> DB: SELECT
    DB --> P: User record
    P --> API: User data
    API -> API: bcrypt.compare()

    alt Valid
        API --> B: 200 OK + Set-Cookie
        MW --> B: Allow /dashboard
        B --> User: Dashboard rendered
    else Invalid
        API --> B: 401 Unauthorized
        B --> User: Error toast
    end
else Cookie Valid
    MW --> B: Allow access
    B --> User: Dashboard rendered
end

opt Password Reset
    User -> B: Submit /forgot-password
    B -> API: POST /forgot-password
    API -> P: create Token
    P -> DB: INSERT
    API --> B: 200 OK
    User -> B: Click email link
    B -> API: POST /reset-password
    API -> P: Update passwordHash
    API --> B: 200 OK
end
@enduml
```

---

## Figure 12: STD-01 Story Session State Transition

```plantuml
@startuml
skinparam monochrome true

[*] --> UNAUTHENTICATED
UNAUTHENTICATED --> DASHBOARD : login success

DASHBOARD --> MODE_SELECTION : click New Story
MODE_SELECTION --> SETUP_WIZARD : select Mode
SETUP_WIZARD --> STORY_INITIALIZED : setup complete
STORY_INITIALIZED --> SCENE_ACTIVE : first scene generated

state SCENE_ACTIVE {
  [*] --> Idle
  Idle --> VIEWING_MODAL : open history/memory
  VIEWING_MODAL --> Idle : close
}

SCENE_ACTIVE --> PROCESSING_INPUT : submit choice/text
PROCESSING_INPUT --> SCENE_ACTIVE : success
PROCESSING_INPUT --> SCENE_ERROR : API fails
SCENE_ERROR --> SCENE_ACTIVE : retry
SCENE_ERROR --> DASHBOARD : abort

SCENE_ACTIVE --> STORY_COMPLETE : final scene
STORY_COMPLETE --> MODE_SELECTION : New Story
STORY_COMPLETE --> DASHBOARD : Dashboard
@enduml
```

---

## Figure 13: STD-02 Video Studio State Transition

```plantuml
@startuml
skinparam monochrome true

[*] --> SETUP : navigate to /video
SETUP --> STORY_IDEA : Continue
STORY_IDEA --> GENERATING_STORY : Generate
GENERATING_STORY --> STORY_REVIEW : success
STORY_REVIEW --> GENERATING_STORY : Regenerate
STORY_REVIEW --> SCENES : Accept

SCENES --> GENERATING_SCENES : Regenerate
GENERATING_SCENES --> SCENES : success
SCENES --> VOICE : Continue
SCENES --> SCENES_OUTDATED : edit dialogues
SCENES_OUTDATED --> VOICE : acknowledge

VOICE --> GENERATING_VOICE : Generate Voice
GENERATING_VOICE --> VOICE_READY : success
VOICE_READY --> MUSIC : Continue

MUSIC --> GENERATING_MUSIC : Generate Music
GENERATING_MUSIC --> MUSIC_READY : success
MUSIC_READY --> PREVIEW : Preview Video
PREVIEW --> SETUP : Back
@enduml
```

---

## Figure 14: STD-03 Authentication State Transition

```plantuml
@startuml
skinparam monochrome true

[*] --> UNAUTHENTICATED
UNAUTHENTICATED --> LOGIN_FORM : visit /auth or redirected

LOGIN_FORM --> AUTHENTICATING : submit login
LOGIN_FORM --> SIGNUP_FORM : click Signup
LOGIN_FORM --> FORGOT_PASSWORD : click Forgot Password

AUTHENTICATING --> AUTHENTICATED : valid
AUTHENTICATING --> LOGIN_FORM : invalid

SIGNUP_FORM --> CREATING_ACCOUNT : submit
CREATING_ACCOUNT --> AUTHENTICATED : created

FORGOT_PASSWORD --> RESET_EMAIL_SENT : submit email
RESET_EMAIL_SENT --> RESET_PASSWORD_FORM : click link
RESET_PASSWORD_FORM --> AUTHENTICATED : password saved

AUTHENTICATED --> DASHBOARD : redirect
DASHBOARD --> UNAUTHENTICATED : logout
AUTHENTICATED --> LOGIN_FORM : session expired
@enduml
```

---

## Figure 15: ER Diagram: Supabase PostgreSQL Data Design

```plantuml
@startuml
skinparam monochrome true
hide circle
left to right direction

entity User {
  * id : string <<PK>>
  --
  name : string
  email : string <<unique>>
  passwordHash : string
  createdAt : DateTime
  updatedAt : DateTime
}

entity PasswordResetToken {
  * id : string <<PK>>
  --
  userId : string <<FK>>
  tokenHash : string
  expiresAt : DateTime
  used : boolean
  createdAt : DateTime
}

entity UserActivity {
  * id : string <<PK>>
  --
  userId : string <<FK>>
  activityType : string
  metadata : Json
  createdAt : DateTime
}

entity StoryProject {
  * id : string <<PK>>
  --
  userId : string <<FK>>
  title : string
  mode : StoryMode
  status : ProjectStatus
  createdAt : DateTime
  updatedAt : DateTime
}

entity StoryDraft {
  * id : string <<PK>>
  --
  storyProjectId : string <<FK>>
  versionNumber : int
  title : string
  genres : Json
  tones : Json
  numberOfScenes : int
  includeNarration : boolean
  status : DraftStatus
  isActive : boolean
  createdAt : DateTime
  updatedAt : DateTime
}

entity Character {
  * id : string <<PK>>
  --
  draftId : string <<FK>>
  name : string
  role : string
  personalityTone : string
  traits : Json
  voiceStyle : string
  appearancePrompt : string
  referenceImageUrl : string
  voiceSampleUrl : string
  sourceType : CharacterSource
}

entity Scene {
  * id : string <<PK>>
  --
  draftId : string <<FK>>
  sceneNumber : int
  title : string
  description : string
  location : string
  mood : string
  selectedSuggestion : string
}

entity Dialogue {
  * id : string <<PK>>
  --
  sceneId : string <<FK>>
  characterId : string <<FK>>
  text : string
  delivery : string
  audioUrl : string
}

entity Choice {
  * id : string <<PK>>
  --
  sceneId : string <<FK>>
  choiceText : string
  choiceType : ChoiceType
  selected : boolean
  resultText : string
}

entity StoryMemory {
  * id : string <<PK>>
  --
  draftId : string <<FK>>
  sceneId : string <<FK>>
  memoryType : string
  content : string
  importanceScore : int
  createdAt : DateTime
}

entity MediaAsset {
  * id : string <<PK>>
  --
  draftId : string <<FK>>
  sceneId : string <<FK>>
  characterId : string <<FK>>
  type : MediaType
  url : string
  storagePath : string
  prompt : string
  provider : string
  status : MediaStatus
  createdAt : DateTime
}

entity VideoGenerationJob {
  * id : string <<PK>>
  --
  draftId : string <<FK>>
  status : JobStatus
  outputUrl : string
  outputStoragePath : string
  errorMessage : string
  createdAt : DateTime
  updatedAt : DateTime
}

User ||--o{ PasswordResetToken : owns
User ||--o{ UserActivity : logs
User ||--o{ StoryProject : creates
StoryProject ||--o{ StoryDraft : has_versions
StoryDraft ||--o{ Character : defines
StoryDraft ||--o{ Scene : contains
StoryDraft ||--o{ StoryMemory : remembers
StoryDraft ||--o{ MediaAsset : stores_metadata_for
StoryDraft ||--o{ VideoGenerationJob : generates
Scene ||--o{ Dialogue : contains
Scene ||--o{ Choice : offers
Scene ||--o{ StoryMemory : creates
Scene ||--o{ MediaAsset : uses
Character ||--o{ Dialogue : speaks
Character ||--o{ MediaAsset : references
@enduml
```

Notes:
- Supabase PostgreSQL stores relational data and metadata.
- Supabase Storage stores uploaded character images, voice samples, generated audio, generated images, and short video outputs.
- `StoryProject` to `StoryDraft` supports multiple drafts and version history.
- `Character.referenceImageUrl` supports camera/upload character appearance.
- `Character.voiceSampleUrl` supports personalized cloned voice generation.

---

## Figure 16: Class Diagram: Application Domain Design

```plantuml
@startuml
skinparam monochrome true
left to right direction

class AuthService {
  + register(name, email, password) : User
  + login(email, password) : Session
  + logout() : void
  + requestPasswordReset(email) : void
  + resetPassword(token, password) : void
}

class StoryProjectService {
  + createProject(userId, setup) : StoryProject
  + getUserProjects(userId) : StoryProject[]
  + updateProjectStatus(projectId, status) : StoryProject
}

class DraftService {
  + createDraft(projectId, input) : StoryDraft
  + createNewVersion(projectId, baseDraftId) : StoryDraft
  + setActiveDraft(draftId) : StoryDraft
  + saveDraft(draftId, input) : StoryDraft
}

class CharacterService {
  + addCharacter(draftId, input) : Character
  + uploadReferenceImage(characterId, file) : MediaAsset
  + uploadVoiceSample(characterId, file) : MediaAsset
  + updateCharacter(characterId, input) : Character
}

class ContextAwarenessService {
  + buildContextPackage(draftId, sceneId) : StoryContext
  + retrieveRelevantMemory(draftId) : StoryMemory[]
  + storeMemory(draftId, sceneId, content) : StoryMemory
}

class StoryGenerationService {
  + generateScene(draftId, choiceText) : Scene
  + generateDialogue(sceneId) : Dialogue[]
  + generateChoices(sceneId) : Choice[]
}

class MediaGenerationService {
  + generateSceneImage(sceneId) : MediaAsset
  + generateCharacterImage(characterId) : MediaAsset
  + generateMusic(draftId) : MediaAsset
}

class VoiceGenerationService {
  + generateTts(dialogueId) : MediaAsset
  + generateClonedVoice(dialogueId, voiceSampleUrl) : MediaAsset
}

class VideoGenerationService {
  + createVideoJob(draftId) : VideoGenerationJob
  + renderPreview(jobId) : VideoGenerationJob
  + saveOutput(jobId, outputUrl) : VideoGenerationJob
}

class StorageService {
  + uploadFile(bucket, path, file) : string
  + getPublicUrl(path) : string
  + deleteFile(path) : void
}

class User {
  + id : string
  + name : string
  + email : string
}

class StoryProject {
  + id : string
  + title : string
  + mode : StoryMode
  + status : ProjectStatus
}

class StoryDraft {
  + id : string
  + versionNumber : number
  + title : string
  + genres : string[]
  + tones : string[]
  + status : DraftStatus
  + isActive : boolean
}

class Character {
  + id : string
  + name : string
  + role : string
  + traits : string[]
  + referenceImageUrl : string
  + voiceSampleUrl : string
  + sourceType : CharacterSource
}

class Scene {
  + id : string
  + sceneNumber : number
  + title : string
  + description : string
  + location : string
  + mood : string
}

class Dialogue {
  + id : string
  + text : string
  + delivery : string
  + audioUrl : string
}

class Choice {
  + id : string
  + choiceText : string
  + choiceType : ChoiceType
  + selected : boolean
}

class StoryMemory {
  + id : string
  + memoryType : string
  + content : string
  + importanceScore : number
}

class MediaAsset {
  + id : string
  + type : MediaType
  + url : string
  + storagePath : string
  + provider : string
  + status : MediaStatus
}

class VideoGenerationJob {
  + id : string
  + status : JobStatus
  + outputUrl : string
  + errorMessage : string
}

AuthService ..> User
StoryProjectService ..> StoryProject
DraftService ..> StoryDraft
CharacterService ..> Character
CharacterService ..> StorageService
StoryGenerationService ..> ContextAwarenessService
StoryGenerationService ..> Scene
StoryGenerationService ..> Dialogue
StoryGenerationService ..> Choice
ContextAwarenessService ..> StoryMemory
MediaGenerationService ..> MediaAsset
MediaGenerationService ..> StorageService
VoiceGenerationService ..> MediaAsset
VoiceGenerationService ..> StorageService
VideoGenerationService ..> VideoGenerationJob
VideoGenerationService ..> StorageService

User "1" -- "0..*" StoryProject
StoryProject "1" *-- "1..*" StoryDraft
StoryDraft "1" *-- "1..*" Character
StoryDraft "1" *-- "1..*" Scene
StoryDraft "1" *-- "0..*" StoryMemory
StoryDraft "1" *-- "0..*" MediaAsset
StoryDraft "1" *-- "0..*" VideoGenerationJob
Scene "1" *-- "0..*" Dialogue
Scene "1" *-- "0..*" Choice
Scene "1" -- "0..*" MediaAsset
Character "1" -- "0..*" Dialogue
Character "1" -- "0..*" MediaAsset
@enduml
```
