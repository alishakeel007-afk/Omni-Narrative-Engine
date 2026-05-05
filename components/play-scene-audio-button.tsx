import { useState, useRef, useEffect } from "react";
import { Play, Square } from "lucide-react";

export function PlaySceneAudioButton({ audioUrls }: { audioUrls: string[] }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const validUrls = audioUrls.filter(Boolean);

  const playSequence = () => {
    if (validUrls.length === 0) return;
    setIsPlaying(true);
    setCurrentIndex(0);
  };

  const stopSequence = () => {
    setIsPlaying(false);
    setCurrentIndex(0);
    if (audioRef.current) {
      audioRef.current.pause();
    }
  };

  useEffect(() => {
    if (isPlaying && currentIndex < validUrls.length) {
      if (audioRef.current) {
        audioRef.current.src = validUrls[currentIndex];
        audioRef.current.play().catch(() => stopSequence());
      }
    } else if (isPlaying && currentIndex >= validUrls.length) {
      setIsPlaying(false);
      setCurrentIndex(0);
    }
  }, [isPlaying, currentIndex, validUrls]);

  const handleEnded = () => {
    setCurrentIndex((prev) => prev + 1);
  };

  if (validUrls.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={isPlaying ? stopSequence : playSequence}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 px-4 py-2 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/20 hover:border-cyan-500/40"
      >
        {isPlaying ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
        {isPlaying ? `Playing ${currentIndex + 1}/${validUrls.length}` : "Play Scene Audio"}
      </button>
      <audio ref={audioRef} onEnded={handleEnded} className="hidden" />
    </>
  );
}
