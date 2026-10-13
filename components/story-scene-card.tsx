import { MapPin, Sparkles } from "lucide-react";
import { SceneMedia } from "@/components/scene-media";

type StorySceneCardProps = {
  title: string;
  text: string;
  mood: string;
  location: string;
  imageLabel: string;
  imagePrompt: string;
  narrationLabel: string;
  narrationDuration: string;
  audioMoodPrompt: string;
  backgroundMusicMood: string;
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

export function StorySceneCard({
  title,
  text,
  mood,
  location,
  imageLabel,
  imagePrompt,
  narrationLabel,
  narrationDuration,
  audioMoodPrompt,
  backgroundMusicMood,
  sceneNumber,
  draftId,
  projectId,
  characterNames,
  characterAppearances,
  existingImageUrl,
  existingNarrationUrl,
  existingMusicUrl,
  onMediaUpdate
}: StorySceneCardProps) {
  return (
    <section className="space-y-5">
      <div className="glass-panel overflow-hidden rounded-[2rem] p-4">
        <SceneMedia
          imagePrompt={imagePrompt}
          imageLabel={imageLabel}
          location={location}
          sceneMood={mood}
          narrationText={text}
          narrationLabel={narrationLabel}
          narrationDuration={narrationDuration}
          audioMoodPrompt={audioMoodPrompt}
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
      </div>

      <div className="glass-panel rounded-[2rem] p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-starlight/20 bg-starlight/10 px-3 py-1 text-xs text-starlight">
            <Sparkles className="h-3.5 w-3.5" />
            {mood}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
            <MapPin className="h-3.5 w-3.5" />
            {location}
          </span>
        </div>

        <h2 className="font-[var(--font-heading)] text-3xl text-white">{title}</h2>
        <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
          <p className="text-base leading-8 text-white/78">{text}</p>
        </div>
      </div>
    </section>
  );
}
