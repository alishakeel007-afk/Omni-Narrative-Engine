import { useState, useRef, useEffect } from "react";
import { Play, Square } from "lucide-react";

export function PreviewFinalAudioButton({
  backgroundMusicUrl,
  voiceAudioUrls
}: {
  backgroundMusicUrl?: string | null;
  voiceAudioUrls: string[];
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const voiceRef = useRef<HTMLAudioElement | null>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);

  const validUrls = voiceAudioUrls.filter(Boolean);

  const playSequence = () => {
    setIsPlaying(true);
    setCurrentIndex(0);
    if (bgmRef.current && backgroundMusicUrl) {
      bgmRef.current.volume = 0.3;
      bgmRef.current.src = backgroundMusicUrl;
      bgmRef.current.loop = true;
      bgmRef.current.play().catch(() => {});
    }
  };

  const stopSequence = () => {
    setIsPlaying(false);
    setCurrentIndex(0);
    if (voiceRef.current) voiceRef.current.pause();
    if (bgmRef.current) bgmRef.current.pause();
  };

  useEffect(() => {
    if (isPlaying && currentIndex < validUrls.length) {
      if (voiceRef.current) {
        voiceRef.current.src = validUrls[currentIndex];
        voiceRef.current.play().catch(() => stopSequence());
      }
    } else if (isPlaying && currentIndex >= validUrls.length && validUrls.length > 0) {
      setIsPlaying(false);
      setCurrentIndex(0);
      if (bgmRef.current) bgmRef.current.pause();
    }
  }, [isPlaying, currentIndex, validUrls]);

  const handleVoiceEnded = () => {
    setCurrentIndex((prev) => prev + 1);
  };

  const disabled = validUrls.length === 0 && !backgroundMusicUrl;

  return (
    <>
      <button
        type="button"
        onClick={isPlaying ? stopSequence : playSequence}
        disabled={disabled}
        className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-5 py-3 text-sm font-bold text-cyan-300 transition-all duration-300 hover:bg-cyan-400/20 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30 disabled:grayscale"
      >
        {isPlaying ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
        {isPlaying ? `Playing Preview...` : "Preview Final Audio"}
      </button>
      <audio ref={voiceRef} onEnded={handleVoiceEnded} className="hidden" />
      <audio ref={bgmRef} className="hidden" />
    </>
  );
}
