import { useState, useRef, useEffect, useMemo } from "react";
import { Play, Square } from "lucide-react";

type PreviewDialogueLine = {
  audioUrl?: string;
};

type PreviewScene = {
  sceneNumber: number;
  backgroundMusicUrl?: string;
  dialogues: PreviewDialogueLine[];
};

export function PreviewFinalAudioButton({
  scenes
}: {
  scenes: PreviewScene[];
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  
  const voiceRef = useRef<HTMLAudioElement | null>(null);
  
  // We use two background music players to crossfade between them
  const bgmRefA = useRef<HTMLAudioElement | null>(null);
  const bgmRefB = useRef<HTMLAudioElement | null>(null);
  
  // Track which BGM player is currently "active"
  const activeBgmRef = useRef<'A' | 'B'>('A');
  const currentSceneNumber = useRef<number | null>(null);

  // Flatten dialogues into a sequence, tracking their parent scene
  const dialogueSequence = useMemo(() => {
    const seq: { scene: PreviewScene; audioUrl: string }[] = [];
    for (const scene of scenes) {
      for (const dialogue of scene.dialogues) {
        if (dialogue.audioUrl) {
          seq.push({ scene, audioUrl: dialogue.audioUrl });
        }
      }
    }
    return seq;
  }, [scenes]);

  const stopSequence = () => {
    setIsPlaying(false);
    setCurrentLineIndex(0);
    if (voiceRef.current) voiceRef.current.pause();
    if (bgmRefA.current) bgmRefA.current.pause();
    if (bgmRefB.current) bgmRefB.current.pause();
    currentSceneNumber.current = null;
  };

  const fadeAudio = (audio: HTMLAudioElement, targetVolume: number, duration: number = 1000) => {
    return new Promise<void>((resolve) => {
      const startVolume = audio.volume;
      const steps = 20;
      const stepTime = duration / steps;
      const volumeStep = (targetVolume - startVolume) / steps;
      let currentStep = 0;

      const fadeInterval = setInterval(() => {
        currentStep++;
        const newVolume = Math.max(0, Math.min(1, startVolume + (volumeStep * currentStep)));
        audio.volume = newVolume;

        if (currentStep >= steps) {
          clearInterval(fadeInterval);
          if (targetVolume === 0) {
            audio.pause();
          }
          resolve();
        }
      }, stepTime);
    });
  };

  const playBackgroundMusicForScene = (scene: PreviewScene) => {
    // If the scene hasn't changed, don't change the music
    if (currentSceneNumber.current === scene.sceneNumber) return;
    currentSceneNumber.current = scene.sceneNumber;

    const newMusicUrl = scene.backgroundMusicUrl;
    
    // Determine which ref is currently active and which is next
    const currentAudio = activeBgmRef.current === 'A' ? bgmRefA.current : bgmRefB.current;
    const nextAudio = activeBgmRef.current === 'A' ? bgmRefB.current : bgmRefA.current;
    
    if (!nextAudio || !currentAudio) return;

    if (newMusicUrl) {
      nextAudio.src = newMusicUrl;
      nextAudio.loop = true;
      nextAudio.volume = 0;
      nextAudio.play().catch(() => {});
      
      // Crossfade: Fade in new, fade out old
      fadeAudio(nextAudio, 0.3, 1000);
      if (!currentAudio.paused) {
        fadeAudio(currentAudio, 0, 1000);
      }
      activeBgmRef.current = activeBgmRef.current === 'A' ? 'B' : 'A';
    } else {
      // Fade out current if no new music
      if (!currentAudio.paused) {
        fadeAudio(currentAudio, 0, 1000);
      }
    }
  };

  const playSequence = () => {
    setIsPlaying(true);
    setCurrentLineIndex(0);
    currentSceneNumber.current = null;
    
    // Start playback right away if we have lines
    if (dialogueSequence.length > 0) {
      const firstItem = dialogueSequence[0];
      playBackgroundMusicForScene(firstItem.scene);
    } else if (scenes.length > 0 && scenes[0].backgroundMusicUrl) {
      // If no voices, just play the first scene's music
      playBackgroundMusicForScene(scenes[0]);
    }
  };

  useEffect(() => {
    if (isPlaying && currentLineIndex < dialogueSequence.length) {
      const currentItem = dialogueSequence[currentLineIndex];
      playBackgroundMusicForScene(currentItem.scene);

      if (voiceRef.current) {
        voiceRef.current.src = currentItem.audioUrl;
        voiceRef.current.play().catch(() => stopSequence());
        
        // Duck the active BGM when voice starts
        const activeBgm = activeBgmRef.current === 'A' ? bgmRefA.current : bgmRefB.current;
        if (activeBgm && !activeBgm.paused) {
          fadeAudio(activeBgm, 0.1, 300);
        }
      }
    } else if (isPlaying && currentLineIndex >= dialogueSequence.length && dialogueSequence.length > 0) {
      // Finished all dialogues
      setIsPlaying(false);
      setCurrentLineIndex(0);
      currentSceneNumber.current = null;
      if (bgmRefA.current) fadeAudio(bgmRefA.current, 0, 1500);
      if (bgmRefB.current) fadeAudio(bgmRefB.current, 0, 1500);
    }
  }, [isPlaying, currentLineIndex, dialogueSequence]);

  const handleVoiceEnded = () => {
    // Restore the active BGM volume when voice ends
    const activeBgm = activeBgmRef.current === 'A' ? bgmRefA.current : bgmRefB.current;
    if (activeBgm && !activeBgm.paused) {
      fadeAudio(activeBgm, 0.3, 500);
    }
    
    setCurrentLineIndex((prev) => prev + 1);
  };

  const disabled = dialogueSequence.length === 0 && !scenes.some(s => !!s.backgroundMusicUrl);

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
      <audio ref={bgmRefA} className="hidden" />
      <audio ref={bgmRefB} className="hidden" />
    </>
  );
}
