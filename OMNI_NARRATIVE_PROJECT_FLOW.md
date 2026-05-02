# 🎭 Omni-Narrative Engine — Project Flow & Frontend Guide

> **COMSATS University Islamabad | BS Data Science (2023–2027)**
> **Team:** M. Ali Shakeel (SP23-BDS-007) · Imran Nadeem (SP23-BDS-020)
> **Supervisor:** Sir Aamir Shabir Parre

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [High-Level System Architecture](#2-high-level-system-architecture)
3. [All 13 Modules (Scope-Based)](#3-all-13-modules-scope-based)
4. [Complete User Flow](#4-complete-user-flow)
   - 4.1 [Story Start — Guided vs Custom Mode](#41-story-start--guided-vs-custom-mode)
   - 4.2 [Story Setup Pipeline](#42-story-setup-pipeline)
   - 4.3 [Scene Generation Pipeline](#43-scene-generation-pipeline)
   - 4.4 [Active Story Loop](#44-active-story-loop)
   - 4.5 [Custom Input Flow (Module 7.13)](#45-custom-input-flow-module-713)
   - 4.6 [Memory & Continuity Flow](#46-memory--continuity-flow)
   - 4.7 [Session Save & Resume Flow](#47-session-save--resume-flow)
5. [Module Interaction Map](#5-module-interaction-map)
6. [Current Implementation Status](#6-current-implementation-status)
7. [What Remains To Be Built](#7-what-remains-to-be-built)
8. [Tech Stack](#8-tech-stack)

---

## 1. Project Overview

The **Omni-Narrative Engine** is an AI-powered, web-based multimedia interactive storytelling platform. It acts as a "digital director" orchestrating:

- A **Large Language Model** (Google Gemini) to generate dynamic story text, scenes, dialogues, and narrative structure
- An **Image Generation Model** (FLUX.1-schnell) to create visually consistent scene images
- A **Text-to-Speech Engine** (ElevenLabs) for character voice narration in different voices per character
- An **Audio/Music Generator** (AudioLDM) for mood-based background music
- A **Vector Database** (ChromaDB) for long-term narrative memory using RAG
- A **Custom Story Path System** allowing users to drive the story with their own imagination

Users can follow a guided setup or create their own story idea — then experience a branching, multimedia narrative that evolves with every choice or custom input they make.

---

## 2. High-Level System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        MODULE 7.1 — FRONTEND                        │
│                                                                      │
│   Story Input → Genre/Tone/Character Setup → Story Mode Selection   │
│   Scene Display (Text + Image + Audio) → Choice / Custom Input      │
│   History View | Memory View | Player State View                    │
└─────────────────────────────┬────────────────────────────────────────┘
                              │ User Input / API Calls
┌─────────────────────────────▼────────────────────────────────────────┐
│                   MODULE 7.13 — CUSTOM STORY PATH                   │
│         Guided Mode <-> Custom Mode toggle at start and per scene   │
│         Validates custom input → passes to Narrative Engine         │
└──────────────────┬──────────────────────────┬────────────────────────┘
                   │                          │
       [Guided choices]              [Custom user input]
                   │                          │
┌──────────────────▼──────────────────────────▼────────────────────────┐
│                   MODULE 7.2 — NARRATIVE ENGINE                     │
│              Google Gemini LLM — Story / Scene / Dialogue           │
│         Receives: user setup + memory context + chosen action       │
│         Produces: scene text, character dialogues, scene metadata   │
└──┬─────────────────────┬──────────────────────────┬─────────────────┘
   │                     │                          │
   ▼                     ▼                          ▼
MODULE 7.4          MODULE 7.9                 MODULE 7.10
Metadata Parser     Narrative Coherence        Emotion Detection
Extract: chars,     Contradiction check        Classify: joy /
objects, mood,      Validate logic flow        fear / suspense /
image prompt,       Against stored facts       calm / tension
sound mood tags
   │                     │                          │
   ▼                     │                          ▼
MODULE 7.5          (feedback loop)           Guides audio mood
Image Generation    back to Narrative         and visual atmosphere
FLUX.1-schnell      Engine if needed
Seed-based
character visual
consistency
   │
   ▼
MODULE 7.6 — AUDIO GENERATION
ElevenLabs TTS (character voices + narration)
AudioLDM (mood-based background music)
Sync audio with scene progression
   │
   ▼
MODULE 7.8 — ASYNC ORCHESTRATION
Python asyncio — runs 7.4, 7.5, 7.6 in parallel
Coordinates synchronized delivery to frontend
   │
   ▼
MODULE 7.7 — LONG-TERM MEMORY (ChromaDB + RAG)
Stores scene, choices, characters, locations
Retrieves relevant past context for next generation
   │
   ▼
MODULE 7.3 — STATE MANAGER & GAME LOGIC
Tracks: HP, inventory, location, story progress
Updates after every scene based on narrative events
   │
   ▼
MODULE 7.12 — CHARACTER IDENTITY TRACKER
Stores: appearance, personality, relationships
Provides reference data for visual consistency (7.5)
   │
   ▼
MODULE 7.11 — ADAPTIVE DIFFICULTY SYSTEM
Monitors user decisions + story progress
Adjusts challenge level dynamically
```

---

## 3. All 13 Modules (Scope-Based)

| # | Module Name | Core Job | Owner |
|---|-------------|----------|-------|
| 7.1 | User Interface & Interaction System | Display story, collect input, play media | Imran |
| 7.2 | Narrative Engine (Story Generation) | LLM-driven story/scene/dialogue generation | Ali |
| 7.3 | State Manager & Game Logic | Track HP, inventory, location, progress | Imran |
| 7.4 | Metadata Parsing & Scene Interpretation | Extract scene data, generate image/audio prompts | Imran |
| 7.5 | Visual Identity & Image Generation | Generate scene images with character consistency | Ali |
| 7.6 | Audio Generation & Sound Design | TTS character voices + mood music | Imran |
| 7.7 | Long-Term Memory & Story Context | ChromaDB vector store, RAG-based retrieval | Ali |
| 7.8 | Async Processing & Orchestration | Parallel generation pipeline via asyncio | Ali |
| 7.9 | Narrative Coherence Engine | Contradiction detection, logic validation | Imran |
| 7.10 | Emotion Detection Engine | Classify scene mood, guide audio and visuals | Ali |
| 7.11 | Adaptive Difficulty System | Dynamic challenge adjustment per user behavior | Imran |
| 7.12 | Character Identity Tracker | Store traits, relationships, visual seeds | Imran |
| 7.13 | Custom Story Path & Guided Choice System | Guided vs Custom mode, validate custom input | Ali + Imran |

---

## 4. Complete User Flow

### 4.1 Story Start — Guided vs Custom Mode

This is the very first decision point powered by **Module 7.13**.

```
User arrives at story start
            │
            ▼
┌───────────────────────────────────────────┐
│         MODULE 7.13 — Story Mode          │
│                                           │
│   Choose how you want to begin:           │
│                                           │
│   ┌───────────────────────────────────┐   │
│   │  GUIDED STORY MODE               │   │
│   │  System provides story setup     │   │
│   │  Genre, scenario, character      │   │
│   │  options are all pre-provided    │   │
│   │  Best for: new / casual users    │   │
│   └───────────────────────────────────┘   │
│                   OR                      │
│   ┌───────────────────────────────────┐   │
│   │  CUSTOM STORY MODE               │   │
│   │  Type your own story idea        │   │
│   │  Set your own world, character   │   │
│   │  and starting premise            │   │
│   │  Best for: creative / advanced   │   │
│   └───────────────────────────────────┘   │
└──────────────┬──────────────┬─────────────┘
               │              │
        [Guided Mode]   [Custom Mode]
               │              │
               ▼              ▼
         Goes through    User types own
         setup steps     story idea directly
         (Section 4.2)   → passed to 7.2
```

---

### 4.2 Story Setup Pipeline

```
USER PROVIDES STORY CONFIGURATION
(Collected by Module 7.1 — UI)

Step 1: Genre Selection
        Fantasy / Sci-Fi / Horror / Romance / Mystery / Adventure
                │
Step 2: Scenario Selection
        Filtered by chosen genre
        Each scenario has: title, description, difficulty tag, theme tag
                │
Step 3: Tone + Difficulty
        Tone: Epic / Dark / Comedic / Romantic / Mystery / Horror
        Difficulty: Easy / Normal / Hard / Adaptive
                │
Step 4: Character Creation
        - Character Name
        - Role/Class (Warrior / Mage / Rogue / Scholar / etc.)
        - Personality Traits (up to 3)
        - Attributes: STR / INT / CHA / AGL / WIS / END (sliders)
                │
                ▼
All config stored in session state
        │
        ▼
MODULE 7.12 — Character Identity Tracker initialized
Stores: name, role, traits, attributes, visual seed
        │
        ▼
MODULE 7.3 — State Manager initialized
HP, XP, inventory, location all set to starting values
        │
        ▼
Passed to Scene Generation Pipeline (Section 4.3)
```

---

### 4.3 Scene Generation Pipeline

This runs every time a new scene needs to be created — at the start and after every user action.

```
INPUTS ASSEMBLED:
  • User setup config (genre, scenario, tone, difficulty, character)
  • Selected choice OR custom user input (from Module 7.13)
  • Current player state (from Module 7.3)
  • Past story context retrieved from ChromaDB (from Module 7.7)
  • Character identity reference (from Module 7.12)
            │
            ▼
┌───────────────────────────────────────────────┐
│         MODULE 7.2 — NARRATIVE ENGINE         │
│                                               │
│  Google Gemini LLM generates:                 │
│  • Scene narrative text                       │
│  • Character dialogues (per character voice)  │
│  • Scene metadata (JSON):                     │
│    - characters present                       │
│    - location description                     │
│    - emotional tone                           │
│    - 4 predefined choices (for guided mode)   │
│    - custom input prompt (for custom mode)    │
└──────┬─────────────────────────────┬──────────┘
       │                             │
       ▼                             ▼
MODULE 7.9                     MODULE 7.10
Narrative Coherence            Emotion Detection
  • Check output               • Classify dominant
    against stored               emotion of scene:
    story facts                  joy / fear /
  • Flag contradictions          suspense / calm /
  • If invalid → trigger         tension / excitement
    regeneration loop          • Tag sent to 7.5 + 7.6
  • If valid → continue
       │
       ▼
MODULE 7.4 — METADATA PARSING
  • Extract: character names, objects, environment details
  • Generate image prompt for this scene
  • Generate sound mood tag (tense / calm / dramatic / etc.)
       │
       ▼
MODULE 7.8 — ASYNC ORCHESTRATION (Python asyncio)
Runs three tasks in parallel:
  ┌──────────────────────────────────────────────────────┐
  │ Task A              Task B              Task C       │
  │ MODULE 7.5          MODULE 7.6          MODULE 7.7   │
  │ FLUX.1-schnell      ElevenLabs TTS      ChromaDB     │
  │ Generate scene      Generate voices     Store scene  │
  │ image using         per character       in vector DB │
  │ image prompt +      + AudioLDM          for future   │
  │ character seeds     background music    RAG retrieval│
  │ for consistency     based on mood tag               │
  └──────────────────────────────────────────────────────┘
       │
       ▼
All outputs ready → delivered to Module 7.1 (UI)
  • Scene text displayed in reading panel
  • Scene image displayed alongside text
  • Narration audio plays automatically
  • Background music starts (mood-matched)
  • 4 choices shown (guided) OR custom input field shown (custom)
  • User can switch between guided and custom at any scene
```

---

### 4.4 Active Story Loop

This is the **core repeating loop** of the entire application.

```
┌─────────────────────────────────────────────────────────────────┐
│                    ACTIVE STORY SCREEN                          │
│                  (Module 7.1 — UI Display)                      │
│                                                                 │
│  Chapter X  ·  Story Title  ·  Scene N                         │
│  ─────────────────────────────────────────────────────         │
│                                                                 │
│  GENERATED SCENE TEXT (scrollable)                             │
│  Full narrative + character dialogue                            │
│                                                                 │
│  SCENE IMAGE (generated by FLUX.1-schnell via Module 7.5)      │
│                                                                 │
│  Narration: [play]  |  Ambient Music: [play]                   │
│                                                                 │
│  ─────────────────────────────────────────────────────         │
│  WHAT WILL YOU DO?              (Module 7.13 — Choice Zone)    │
│                                                                 │
│  A. [Choice text]    [Risk: Low]    [Style: Diplomatic]        │
│  B. [Choice text]    [Risk: High]   [Style: Reckless]          │
│  C. [Choice text]    [Risk: Med]    [Style: Pragmatic]         │
│  D. [Choice text]    [Risk: Low]    [Style: Noble]             │
│  ─────────────────────────────────────────────────────         │
│  Or type your own action / dialogue / story direction...       │
│                                                                 │
│  [Story History]   [Story Memory]   [Player State]             │
└─────────────────────────────────────────────────────────────────┘
               │
       User makes a choice (A/B/C/D or custom text)
               │
               ▼
       Choice recorded → Module 7.7 stores in memory
               │
               ▼
       Module 7.3 updates player state
       (HP / XP / inventory / location change)
               │
               ▼
       Module 7.11 checks difficulty adjustment
               │
               ▼
       Scene Generation Pipeline runs again (Section 4.3)
               │
               ▼
       New scene displayed → loop continues
```

---

### 4.5 Custom Input Flow (Module 7.13)

This is the key differentiator of the Omni-Narrative Engine from other AI storytelling tools.

```
DURING A SCENE — User types their own action:

  User types: "I try to bribe the guard with the gold coin I found earlier"
                          │
                          ▼
             MODULE 7.13 — Custom Input Handler
                          │
             ┌────────────▼────────────────────┐
             │   Validation checks:            │
             │   • Is input coherent with the  │
             │     current scene context?      │
             │   • Does it reference items or  │
             │     characters in memory?       │
             │   • Is it logically possible    │
             │     in this story world?        │
             └────────────┬────────────────────┘
                          │
               ┌──────────┴──────────┐
               │                     │
          [Valid input]        [Invalid / illogical]
               │                     │
               ▼                     ▼
     Passed to Module 7.2      Prompt user to rephrase
     as the chosen action      or select a provided option
               │
               ▼
     Module 7.7 stores the
     custom decision in memory
     so future scenes reference it
               │
               ▼
     Scene Generation Pipeline runs
     with custom input as the context
               │
               ▼
     Story continues naturally from
     the user's own imagination


STORY PROGRESS PATH (FE-7 of Module 7.13):

  Scene 1 ──► Scene 2 ──► Scene 3 ──► [Current Scene]
  [Dark forest]  [Met stranger]   [At the gate]
  Choice: "Follow path"   Custom: "Offer him bread"
                                         │
                                  [Possible next steps]
                                  → "Confront the keeper"
                                  → "Find the hidden path"


USER CAN SWITCH MODES AT ANY SCENE:
  Guided mode → click "Type your own" → switches to custom input
  Custom mode → click one of the 4 options → switches to guided
  Both modes always available side by side
```

---

### 4.6 Memory & Continuity Flow

**Module 7.7** keeps the story coherent across many scenes via ChromaDB and RAG.

```
EVERY TIME A SCENE IS GENERATED:

  Scene text + choices + custom input
              │
              ▼
  MODULE 7.7 — ChromaDB Vector Store
  Stores as embeddings:
  • Key events that happened
  • Characters introduced and their current state
  • Locations visited
  • Active story threads (unresolved plot points)
  • User decisions (guided + custom)
              │
              ▼
  NEXT SCENE GENERATION — RAG Retrieval:
  "What past events are most relevant to this scene?"
              │
              ▼
  Top K relevant memories retrieved
  and injected into LLM context window
              │
              ▼
  Module 7.2 generates next scene
  with full awareness of past events
              │
              ▼
  Module 7.9 cross-checks:
  "Does this new scene contradict anything stored?"
  If yes → regenerate
  If no  → deliver to UI


USER-FACING MEMORY VIEW (Story Memory Page):

  ┌──────────────────────────────────────────┐
  │ KEY EVENTS          │ CHARACTERS MET     │
  │ • Scene 3 [Critical]│ • Aldric [Ally]    │
  │   Dragon appeared   │   Last seen: Sc 5  │
  │ • Scene 7 [High]    │ • The Keeper[Rival]│
  │   Artifact stolen   │   Last seen: Sc 7  │
  ├──────────────────────────────────────────┤
  │ LOCATIONS           │ ACTIVE THREADS     │
  │ • Shattered Keep    │ • The lost artifact│
  │   [Visited]         │   [Active]         │
  │ • Dark Forest       │ • Aldric's secret  │
  │   [Visited]         │   [Active]         │
  └──────────────────────────────────────────┘
```

---

### 4.7 Session Save & Resume Flow

```
USER SAVES SESSION:

  Current state bundled and saved to database:
  • Full narrative history (all past scenes)
  • ChromaDB memory snapshot
  • Player state (HP / XP / inventory / location)
  • Character identity data (Module 7.12)
  • Last scene text + available choices
  • Story mode setting (guided or custom)
  • Active story threads
              │
USER RESUMES SESSION:
              │
              ▼
  Data loaded from database
  ChromaDB context restored
  Player state restored
  Character identity restored
  Story opens at exact last saved scene
  Same choices available as when saved
              │
              ▼
  User continues — zero narrative break
```

---

## 5. Module Interaction Map

```
                    ┌──────────────┐
                    │  7.1 — UI   │ ◄── Displays everything to user
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │ 7.13 Custom  │ ◄── User picks guided or types own
                    │ Story Path   │
                    └──────┬───────┘
                           │
              ┌────────────▼─────────────┐
              │   7.2 — Narrative Engine │ ◄── Context from 7.7
              │   (Google Gemini LLM)    │ ◄── Char data from 7.12
              └──┬────────────────────┬──┘ ◄── State from 7.3
                 │                    │
          ┌──────▼──────┐    ┌────────▼────┐
          │ 7.9 Coherence│   │ 7.10 Emotion│
          │ (validates)  │   │ (classifies)│
          └──────┬───────┘   └──────┬──────┘
                 │ (feedback)       │ (mood tag)
                 ▼                  ▼
          ┌──────────────────────────────────┐
          │      7.4 — Metadata Parser       │
          │  Extracts image + audio prompts  │
          └──────────────┬───────────────────┘
                         │
          ┌──────────────▼───────────────────┐
          │    7.8 — Async Orchestration     │
          │          (asyncio)               │
          └──┬──────────────┬────────────┬───┘
             │              │            │
      ┌──────▼──┐   ┌───────▼───┐  ┌────▼────┐
      │  7.5    │   │   7.6     │  │  7.7    │
      │ Image   │   │ Audio TTS │  │ Memory  │
      │ Gen     │   │ + Music   │  │ ChromaDB│
      └─────────┘   └───────────┘  └────┬────┘
                                        │
                               ┌────────▼────────┐
                               │  7.3 — State    │
                               │  Manager        │
                               └────────┬────────┘
                                        │
                               ┌────────▼────────┐
                               │ 7.11 Adaptive   │
                               │ Difficulty      │
                               └─────────────────┘
                                        │
                               ┌────────▼────────┐
                               │ 7.12 Character  │
                               │ Identity Tracker│
                               └─────────────────┘
```

---

## 6. Current Implementation Status

### Your Completed Backend Pipeline

```
User Input (story idea + genre + tone)
              │
              ▼
    MODULE 7.2 — Narrative Engine          ✅ COMPLETE
    Google Gemini LLM generates:
    • Full structured story
    • Individual scenes
    • Character dialogues
    • Narrative descriptions
              │
              ▼
    MODULE 7.6 — Audio Generation
    ElevenLabs TTS:
    • Different voice per character         ✅ Complete
    • Narration voice for story text        ✅ Complete
    AudioLDM background music:
    • Mood-based music generation           🔲 Pending
```

### Where your work fits across all 13 modules:

| Your Work | Scope Module | Status |
|-----------|-------------|--------|
| LLM generates story, scenes, dialogues, narrative | **7.2 Narrative Engine** | ✅ Complete |
| TTS converts dialogues into different character voices | **7.6 Audio Generation** | ⚠️ Partial — music pending |
| User inputs genre and tone | **7.1 UI** | 🔲 Needs proper frontend |
| Guided vs custom mode at story start | **7.13 Custom Story Path** | 🔲 Pending |

---

## 7. What Remains To Be Built

### Backend Modules

| Module | Status | Notes |
|--------|--------|-------|
| 7.2 Narrative Engine | ✅ Complete | LLM pipeline working |
| 7.6 Audio — TTS | ✅ Complete | Multi-voice working |
| 7.6 Audio — Music | 🔲 Pending | AudioLDM integration |
| 7.5 Image Generation | 🔄 In Progress | FLUX.1-schnell |
| 7.7 Long-Term Memory | 🔄 In Progress | ChromaDB + RAG |
| 7.8 Async Orchestration | 🔲 Planned | asyncio parallel pipeline |
| 7.4 Metadata Parser | 🔲 Planned | Auto prompt extraction from LLM output |
| 7.3 State Manager | 🔲 Planned | HP, inventory, location tracking |
| 7.9 Coherence Engine | 🔲 Planned | Contradiction detection loop |
| 7.10 Emotion Detection | 🔲 Planned | Mood classification per scene |
| 7.12 Character Tracker | 🔲 Planned | Identity + visual seed storage |
| 7.13 Custom Story Path | 🔲 Planned | Guided vs custom mode + input validation |
| 7.11 Adaptive Difficulty | 🔲 Planned | Dynamic challenge per user behaviour |

### Frontend Screens

| Priority | Screen | Connected Modules |
|----------|--------|------------------|
| 🔴 High | Active Story Screen | 7.1, 7.13, 7.2, 7.6 |
| 🔴 High | Story Mode Selection (Guided vs Custom) | 7.13 |
| 🔴 High | Story Setup Wizard (Genre → Character) | 7.1, 7.3, 7.12 |
| 🔴 High | Scene Loading Screen (progress bars) | 7.8, 7.5, 7.6 |
| 🟠 Medium | Landing Page | 7.1 |
| 🟠 Medium | Login / Signup | 7.1 |
| 🟠 Medium | Story Hub Dashboard | 7.1, 7.3 |
| 🟠 Medium | Continue Session Page | 7.7, 7.3 |
| 🟡 Low | Story History Page | 7.7 |
| 🟡 Low | Story Memory Page | 7.7, 7.9 |
| 🟡 Low | Player State Page | 7.3, 7.11, 7.12 |
| 🟡 Low | Profile & Settings | 7.1 |
| 🟡 Low | Logout Confirmation | 7.1 |
| 🟢 Future | Admin Dashboard | — |
| 🟢 Future | Export Video | — |

---

## 8. Tech Stack

| Layer | Technology | Used By Module |
|-------|-----------|---------------|
| Frontend | React / Next.js | 7.1 |
| LLM | Google Gemini 3.1 Flash | 7.2 |
| Image Generation | FLUX.1-schnell (Hugging Face) | 7.5 |
| TTS / Voice | ElevenLabs | 7.6 |
| Music Generation | AudioLDM | 7.6 |
| Vector Memory | ChromaDB | 7.7 |
| Async Pipeline | Python asyncio | 7.8 |
| Backend API | Python / FastAPI | All modules |
| Auth | JWT + Google OAuth | 7.1 |
| Database | PostgreSQL | 7.3, 7.7, sessions |
| Custom Input Validation | LLM prompt layer | 7.13 |

---

*Last updated: May 2026 | Version 2.0 — Scope-based (13 Modules)*
*Includes Module 7.13 — Custom Story Path & Guided Choice System*
