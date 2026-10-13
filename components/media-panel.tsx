import { SceneMedia } from "@/components/scene-media";

type MediaPanelProps = {
  backgroundMusicMood: string;
  imageLabel: string;
  narrationDuration: string;
  narrationLabel: string;
  sceneMood: string;
  imagePrompt: string;
  audioPrompt: string;
  narrationText: string;
  location?: string;
  sceneNumber: number;
  draftId?: string;
  projectId?: string;
  characterNames?: string[];
  characterAppearances?: string[];
  existingImageUrl?: string;
  existingNarrationUrl?: string;
  existingMusicUrl?: string;
  onMediaUpdate?: (patch: { imageUrl?: string; narrationAudioUrl?: string; musicUrl?: string }) => void;
};

export function MediaPanel({
  backgroundMusicMood,
  imageLabel,
  narrationDuration,
  narrationLabel,
  sceneMood,
  imagePrompt,
  audioPrompt,
  narrationText,
  location,
  sceneNumber,
  draftId,
  projectId,
  characterNames,
  characterAppearances,
  existingImageUrl,
  existingNarrationUrl,
  existingMusicUrl,
  onMediaUpdate
}: MediaPanelProps) {
  return (
    <section className="glass-panel rounded-[2rem] p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-starlight/80">Generated Media</p>
          <h3 className="mt-2 font-[var(--font-heading)] text-2xl text-white">
            Multi-Modal Output
          </h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/90">
          Scene Mood: {sceneMood}
        </span>
      </div>

      <div className="grid gap-5">
        <SceneMedia
          imagePrompt={imagePrompt}
          imageLabel={imageLabel}
          location={location}
          sceneMood={sceneMood}
          narrationText={narrationText}
          narrationLabel={narrationLabel}
          narrationDuration={narrationDuration}
          audioMoodPrompt={audioPrompt}
          backgroundMusicMood={backgroundMusicMood}
          sceneNumber={sceneNumber}
          draftId={draftId}
          projectId={projectId}
          characterNames={characterNames}
          characterAppearances={characterAppearances}
          existingImageUrl={existingImageUrl}
          existingNarrationUrl={existingNarrationUrl}
          existingMusicUrl={existingMusicUrl}
          onUpdate={onMediaUpdate}
        />
        <PromptBlock label="Image Prompt Preview" text={imagePrompt} />
        <PromptBlock label="Audio Mood Prompt Preview" text={audioPrompt} />
      </div>
    </section>
  );
}

function PromptBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-[1.4rem] border border-starlight/10 bg-starlight/5 p-4">
      <p className="text-xs uppercase tracking-[0.26em] text-starlight/72">{label}</p>
      <p className="mt-3 text-sm leading-7 text-white/72">{text}</p>
    </div>
  );
}
