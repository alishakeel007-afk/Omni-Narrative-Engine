import { MapPin, Clapperboard, Heart } from "lucide-react";
import { AudioPlayerMock } from "@/components/audio-player-mock";

type StorySceneCardProps = {
  title: string;
  text: string;
  mood: string;
  location: string;
  imageLabel: string;
  emotionDirectives?: {
    primaryEmotion: string;
    intensity: number;
    videoAtmosphere: string;
    musicStyle: string;
    voiceStyle: string;
  };
};

export function StorySceneCard({
  title,
  text,
  mood,
  location,
  imageLabel,
  emotionDirectives
}: StorySceneCardProps) {
  return (
    <section className="space-y-5">
      <div className="glass-panel overflow-hidden rounded-[2rem]">
        <div className="relative h-72 bg-[radial-gradient(circle_at_top,rgba(179,179,179,0.28),transparent_28%),linear-gradient(160deg,#1b1b1b,#070b1b_78%)] sm:h-80">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_10%,rgba(6,6,6,0.82))]" />
          <div className="absolute right-5 top-5 rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-xs text-gold">
            Generated Scene Art
          </div>
          <div className="absolute bottom-5 left-5 right-5">
            <p className="max-w-xl text-sm text-white/90">{imageLabel}</p>
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-[2rem] p-6 space-y-5">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-starlight/20 bg-starlight/10 px-3 py-1 text-xs text-starlight">
              <Clapperboard className="h-3.5 w-3.5" />
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

        {emotionDirectives && (
          <div className="rounded-[1.5rem] border border-white/10 bg-black/30 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Heart className="h-4 w-4 text-rose-400 fill-rose-400/20" />
              <h3 className="text-sm font-semibold text-white/90">Atmosphere & Mood Directives (Module 7.10)</h3>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 text-xs">
              <div className="rounded-xl bg-white/5 p-3 border border-white/5 space-y-1">
                <span className="text-white/50 font-medium block">🎭 Primary Emotion</span>
                <span className="text-white font-semibold text-sm">{emotionDirectives.primaryEmotion}</span>
                <span className="text-white/40 block text-[10px]">Intensity: {Math.round(emotionDirectives.intensity * 100)}%</span>
              </div>
              <div className="rounded-xl bg-white/5 p-3 border border-white/5 space-y-1">
                <span className="text-white/50 font-medium block">🎬 Visual Atmosphere</span>
                <span className="text-white leading-relaxed">{emotionDirectives.videoAtmosphere}</span>
              </div>
              <div className="rounded-xl bg-white/5 p-3 border border-white/5 space-y-1">
                <span className="text-white/50 font-medium block">🎙️ Narrator Style</span>
                <span className="text-white leading-relaxed">{emotionDirectives.voiceStyle}</span>
              </div>
              <div className="rounded-xl bg-white/5 p-3 border border-white/5 space-y-1">
                <span className="text-white/50 font-medium block">🎵 Music Style</span>
                <span className="text-white leading-relaxed">{emotionDirectives.musicStyle}</span>
              </div>
            </div>
          </div>
        )}

        <div>
          <AudioPlayerMock />
        </div>
      </div>
    </section>
  );
}
