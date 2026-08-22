# Create Your Own Story Flow

This workflow replaces the old Custom Mode path while keeping Guided Mode and the existing Video Studio flow intact.

## Route Flow

Dashboard or Story Mode Selection
-> `/setup`
-> `/story-builder`
-> `/audio-generation`
-> `/video-preview`

## Story Setup Page

Custom Mode uses the existing `/setup` route with a Create Your Own Story setup form.

The user can define:

- Story title
- Multiple genres
- Multiple tones
- Number of scenes
- Multiple characters
- Character name, role, personality/tone, and voice style placeholder

When the user clicks **Start Building Story**, the setup is saved to localStorage and the user is routed to `/story-builder`.

## Story Builder Page

The `/story-builder` page is the main scene writing workspace.

Each scene includes:

- Scene number
- Scene title input
- Story description textarea
- 3 mock AI scene suggestions
- Character-wise dialogue inputs
- Generate Dialogue with AI button
- Add Next Scene button
- End Story button

Story description and dialogue stay on the same page. The user can move between previous scenes from the scene list, edit text, regenerate mock dialogue, and continue adding scenes before ending the story.

## Mock AI Suggestions

The AI suggestion logic is currently dummy frontend logic in `lib/create-story-storage.ts`.

It creates 3 scene options using:

- Story title
- Selected genres
- Selected tones
- Character names

The **Generate Dialogue with AI** button also uses mock frontend logic. It generates editable dialogue using:

- Current scene description or selected suggestion
- Characters
- Selected tones
- Character role and personality text

No real LLM API is called in this new custom workflow yet.

## Audio Generation Page

The `/audio-generation` page shows:

- Story title
- Scene list
- Character voice placeholders
- Dialogue previews
- Separate voice and background music controls

Buttons:

- **Generate Character Voices**
- **Generate Background Music**
- **Edit Story**
- **Generate Video**

Voice generation and background music are currently mock status flows for this custom workflow. They show loading states and save `ready` status in localStorage.

The existing Deepgram TTS integration remains available in the current Video Studio voice flow. This new custom workflow is ready for backend TTS wiring later.

## Video Preview Page

The `/video-preview` page is a frontend placeholder for the future video backend.

It shows:

- Large video preview frame
- Story title
- Number of scenes
- Audio status
- Download Video button
- Back to Edit Story button
- Back to Audio Page button

Download Video currently shows:

`Video download will be available after backend integration.`

## State Management

Custom story workflow data is stored in localStorage using:

`omni-narrative-engine-create-your-own-story`

The draft tracks:

- Selected mode
- Story title
- Genres
- Tones
- Number of scenes
- Characters
- Scenes
- Dialogues
- Selected AI suggestions
- Voice generation status
- Background music status
- Video preview status

Refreshing the browser keeps the custom setup, scenes, dialogue edits, and audio statuses.

## Backend Still To Add Later

The following are intentionally mocked for now:

- Real LLM scene suggestions
- Real LLM dialogue generation
- Character-by-character TTS for the custom workflow
- Background music API generation
- Video generation/rendering backend
- Downloadable final video export
