# Omni-Narrative Engine - Next Phase Implementation Roadmap

**Target:** 30% → 70% Completion (6-8 weeks)

---

## PHASE 1: CRITICAL INFRASTRUCTURE (Weeks 1-3)

### Sprint 1.1: Async Orchestration Framework (Week 1)

#### Goal: Enable parallel text + image + audio generation

#### Tasks:
1. **Set up Bull Queue**
   ```bash
   npm install bull redis
   ```
   - Create `/lib/queue.ts` for queue initialization
   - Configure Redis connection
   - Add queue monitoring dashboard

2. **Create Orchestration Service** (`/lib/orchestration.ts`)
   ```typescript
   export async function orchestrateMediaGeneration({
     text: string,
     imagePrompt: string,
     audioMoodPrompt: string
   }): Promise<{
     text: string,
     imageUrl: string,
     audioUrl: string
   }> {
     // Use Promise.all() for parallel execution
     const [scene, image, audio] = await Promise.all([
       generateScene(...),
       generateImage(...),
       generateAudio(...)
     ]);
     return { scene, image, audio };
   }
   ```

3. **Refactor Generate-Scene Route**
   - Move from `/app/api/story/generate-scene/route.ts`
   - Split into:
     - `/lib/scene-generation.ts` (core logic)
     - `/lib/image-generation.ts` (stub for FLUX)
     - `/lib/audio-generation.ts` (stub for audio)
   - Create job processor in queue

4. **Add Error Handling & Retries**
   - Implement exponential backoff
   - Fallback strategies
   - Logging and monitoring

**Expected Impact:**
- Response time: 15s → 5-6s (66% reduction)
- User experience: Significantly better
- Effort: 40-50 hours

---

### Sprint 1.2: Vector Database & RAG (Week 2-3)

#### Goal: Replace simple list-based memory with semantic retrieval

#### Tasks:
1. **Integrate ChromaDB**
   ```bash
   npm install chromadb
   ```
   - Create `/lib/chromadb.ts` wrapper
   - Initialize collection per story
   - Setup embedding model (all-MiniLM-L6-v2)

2. **Create Memory Embedding System**
   ```typescript
   // In /services/memoryService.ts
   export async function storeMemoryWithEmbedding(
     memory: MemoryItem,
     storyId: string
   ) {
     const embedding = await generateEmbedding(memory.text);
     return chromadb.add(
       collection: storyId,
       documents: [memory.text],
       embeddings: [embedding],
       metadatas: [{ sceneNumber, choiceType, timestamp }]
     );
   }
   
   export async function retrieveRelevantMemories(
     query: string,
     storyId: string,
     topK = 5
   ) {
     return chromadb.query(
       collection: storyId,
       queryTexts: [query],
       nResults: topK
     );
   }
   ```

3. **Update Prompt Building**
   - Change from "last 3 scenes" to "most relevant 5 memories"
   - Use semantic similarity for retrieval
   - Include relevance scores in prompt

4. **Add Memory Compression**
   - Summarize older memories
   - Archive less important items
   - Maintain token budget for context window

**Expected Impact:**
- Narrative coherence: Significantly improved
- Context relevance: Better memory retrieval
- Context efficiency: Better token usage
- Effort: 30-40 hours

---

## PHASE 2: MEDIA GENERATION INTEGRATION (Weeks 4-6)

### Sprint 2.1: Image Generation (Week 4)

#### Goal: Integrate FLUX.1 for actual image generation

#### Tasks:
1. **Integrate FLUX.1 API**
   ```typescript
   // /lib/image-generation.ts
   export async function generateImage(params: {
     prompt: string,
     characterName: string,
     seedValue?: number
   }): Promise<{ imageUrl: string }> {
     // Call FLUX.1-schnell API
     // Store seed for consistency
     // Return CDN URL
   }
   ```

2. **Implement Character Visual Consistency**
   ```typescript
   // /lib/character-visuals.ts
   export class CharacterVisualTracker {
     private seeds: Map<string, number> = new Map();
     
     generateCharacterImage(characterName: string, scene: string) {
       const seed = this.seeds.get(characterName) || Math.random() * 10000;
       const prompt = this.buildConsistentPrompt(characterName, scene, seed);
       return generateImage({ prompt, seedValue: seed });
     }
   }
   ```

3. **Add Image Storage**
   - Upload to Supabase/S3
   - Create CDN links
   - Cache generated images

4. **Update Story Flow**
   - Replace mock image responses
   - Stream images during scene generation
   - Display in UI during playback

**Expected Impact:**
- Visual immersion: Immediate
- Scene visualization: Complete
- Character recognition: Better with seeds
- Effort: 35-45 hours

---

### Sprint 2.2: Audio Generation (Week 5-6)

#### Goal: Integrate ElevenLabs TTS + AudioLDM for music

#### Tasks:
1. **Integrate ElevenLabs TTS**
   ```typescript
   // /lib/text-to-speech.ts
   export async function synthesizeNarration(params: {
     text: string,
     voiceId: string,
     speed?: number,
     emotion?: string
   }): Promise<{ audioUrl: string }> {
     const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech', {
       method: 'POST',
       headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
       body: JSON.stringify({
         text,
         voice_settings: { voice_id: voiceId },
         model_id: 'eleven_monolingual_v1'
       })
     });
     
     const audioBuffer = await response.arrayBuffer();
     const url = await uploadToStorage(audioBuffer, `narration-${uuid}.mp3`);
     return { audioUrl: url };
   }
   ```

2. **Integrate AudioLDM for Background Music**
   ```typescript
   // /lib/background-music.ts
   export async function generateBackgroundMusic(params: {
     mood: string,
     duration: number,
     genre: string
   }): Promise<{ trackUrl: string }> {
     // Call AudioLDM via HuggingFace Inference API
     // Generate mood-appropriate music
     // Store and return URL
   }
   ```

3. **Character Voice Assignment**
   - Map characters to ElevenLabs voice profiles
   - Store voice preferences in database
   - Support multiple voices per scene

4. **Audio Synchronization**
   - Calculate narration duration
   - Sync text display with audio
   - Add playback controls

**Expected Impact:**
- Audio immersion: Complete
- Narration quality: Professional
- Music atmosphere: Genre/mood matched
- Effort: 40-50 hours

---

## PHASE 3: INTELLIGENCE SYSTEMS (Weeks 7-10)

### Sprint 3.1: Narrative Coherence Engine (Week 7)

#### Goal: Validate and maintain story consistency

#### Tasks:
1. **Build Contradiction Detector**
   ```typescript
   // /lib/coherence-engine.ts
   export async function detectContradictions(params: {
     newScene: StoryScene,
     memoryTimeline: MemoryItem[],
     characterStates: Map<string, CharacterState>
   }): Promise<{
     contradictions: Contradiction[],
     severity: 'low' | 'medium' | 'high'
   }> {
     // Check if character actions align with state
     // Verify location consistency
     // Check for timeline violations
     // Cross-reference with memory
   }
   ```

2. **Implement Logical Validator**
   - Character can't be in two places simultaneously
   - Health/stats can't change unrealistically
   - Cause-effect relationships should be logical
   - Previous decisions should affect outcomes

3. **Add Coherence Feedback Loop**
   - If contradictions detected, flag for regeneration
   - Provide LLM with coherence constraints
   - Suggest corrections

4. **Scene Regeneration with Constraints**
   - On contradiction, request LLM to regenerate
   - Include coherence requirements in prompt
   - Track regeneration attempts

**Expected Impact:**
- Story quality: Significantly improved
- Narrative believability: Better
- User immersion: Less disruption
- Effort: 30-40 hours

---

### Sprint 3.2: Emotion Detection Engine (Week 8)

#### Goal: Analyze and classify emotional tone

#### Tasks:
1. **Integrate Sentiment Analysis**
   ```bash
   npm install @huggingface/inference
   ```
   
   ```typescript
   // /lib/emotion-detection.ts
   export async function detectEmotions(text: string) {
     const classifier = await pipeline('sentiment-analysis');
     const result = await classifier(text);
     // Maps to: anger, fear, joy, sadness, surprise, neutral
     return mapToEmotionLabels(result);
   }
   ```

2. **Classify Scene Emotions**
   ```typescript
   export function classifySceneEmotion(scene: StoryScene) {
     const emotions = await detectEmotions(scene.text);
     const dominant = emotions.sort((a, b) => b.score - a.score)[0];
     
     return {
       primary: dominant.label,
       secondary: emotions.slice(1, 3),
       intensity: calculateIntensity(emotions),
       narrative_pace: determinePace(emotions)
     };
   }
   ```

3. **Feedback to Audio/Visual**
   - Adjust music tempo based on intensity
   - Modify narration speed/emotion
   - Influence image mood tags

4. **Emotional Arc Tracking**
   - Track emotional progression across scenes
   - Detect unusual emotional shifts
   - Guide narrative flow

**Expected Impact:**
- Audio/visual coherence: Better
- Immersive experience: Enhanced
- Scene atmosphere: Dynamically matched
- Effort: 25-35 hours

---

### Sprint 3.3: Adaptive Difficulty System (Week 9-10)

#### Goal: Dynamically adjust challenge based on player

#### Tasks:
1. **Performance Tracking**
   ```typescript
   // /lib/difficulty-adaptive.ts
   export class DifficultyAdapter {
     trackChoiceOutcome(choice: string, scene: StoryScene, outcome: 'success' | 'failure') {
       // Track player success rate
       // Calculate performance metrics
       // Evaluate risk-taking behavior
     }
   }
   ```

2. **Implement Difficulty Algorithm**
   ```typescript
   export function calculateAdaptiveDifficulty(params: {
     successRate: number, // 0-1
     riskTakingLevel: number, // 0-1
     sessionTime: number,
     currentDifficulty: string
   }): string {
     // If success > 75%, increase difficulty
     // If success < 50%, decrease difficulty
     // Account for player style (aggressive/careful)
     // Smooth transitions (don't jump suddenly)
   }
   ```

3. **Difficulty Modulation**
   - Adjust challenge descriptions in options
   - Modify stat impact of choices
   - Scale enemy difficulty / obstacle complexity
   - Adjust reward values

4. **Player Feedback**
   - Display difficulty indicator
   - Show performance metrics
   - Allow manual difficulty adjustment

**Expected Impact:**
- Player engagement: Better for all skill levels
- Replayability: Increased
- Retention: Improved
- Effort: 35-45 hours

---

## PHASE 4: FINAL POLISH (Weeks 11+)

### Tasks:
1. Edge case handling and bug fixes (1 week)
2. Comprehensive testing suite (2 weeks)
3. Performance optimization (1 week)
4. User documentation (1 week)
5. Accessibility improvements (1 week)
6. Security audit and hardening (1 week)

---

## ESTIMATED EFFORT BREAKDOWN

| Phase | Component | Hours | Weeks |
|-------|-----------|-------|-------|
| 1.1 | Async Orchestration | 40-50 | 1 |
| 1.2 | Vector Memory | 30-40 | 1-2 |
| 2.1 | Image Generation | 35-45 | 1 |
| 2.2 | Audio Generation | 40-50 | 2 |
| 3.1 | Coherence Engine | 30-40 | 1 |
| 3.2 | Emotion Detection | 25-35 | 1 |
| 3.3 | Adaptive Difficulty | 35-45 | 2 |
| 4 | Polish & Testing | 40-60 | 2+ |
| **TOTAL** | | **275-365** | **12-16 weeks** |

**Team of 2 developers:** 6-8 weeks  
**Solo developer:** 12-16 weeks

---

## DEPENDENCIES & ORDERING

```
Async Orchestration (Week 1)
    ↓ enables ↓
Image Gen + Audio Gen (Weeks 4-6)
    ↓ enables ↓
Coherence Engine (Week 7)
    ↓ complements ↓
Emotion Detection (Week 8)
    ↓ complements ↓
Adaptive Difficulty (Weeks 9-10)

Vector Memory (Weeks 2-3) - can run in parallel
    ↓ improves all subsequent systems
```

---

## EXPECTED COMPLETION MILESTONES

| Milestone | Timeline | Completion % |
|-----------|----------|--------------|
| Async Orchestration Complete | Week 1 | 35% |
| Vector Memory Complete | Week 3 | 42% |
| Image Generation Live | Week 4 | 52% |
| Audio Generation Live | Week 6 | 62% |
| Coherence Engine Live | Week 7 | 70% |
| Emotion Detection Live | Week 8 | 75% |
| Adaptive Difficulty Live | Week 10 | 82% |
| Polish & Testing | Week 12-16 | 95-100% |

---

## RISK ASSESSMENT

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| API rate limits (Gemini/ElevenLabs) | High | Medium | Implement caching, queuing |
| Vector DB performance | Medium | Medium | Test at scale, optimize queries |
| Audio/Image API costs | High | Medium | Monitor usage, implement quotas |
| Integration bugs | Medium | Low | Comprehensive testing |
| Scope creep | Medium | High | Strict phase planning |

---

## SUCCESS CRITERIA

By end of Phase 3 (Week 10):
- ✅ All 12 modules at least 50% complete
- ✅ Response time < 8 seconds
- ✅ Narrative coherence significantly improved
- ✅ Full multimedia experience working
- ✅ Difficulty adapting to player
- ✅ Memory retrieval semantic and relevant
- ✅ 95% API integration complete

---

## NEXT IMMEDIATE ACTIONS

**This Week (Week 1):**
1. Set up Bull Redis queue
2. Start Async Orchestration sprint
3. Refactor story generation endpoint
4. Deploy to staging environment

**Next Week (Week 2):**
1. Complete async system
2. Begin ChromaDB integration
3. Set up embedding model
4. Test with sample stories

**Following Week (Week 3):**
1. Complete vector memory
2. Begin image generation API setup
3. Prepare for Phase 2 sprint

---

**Created:** 2025-08-13  
**Target Completion:** 70% by Week 10  
**Full Completion:** Week 16-20
