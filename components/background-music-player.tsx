"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  sceneMood?: string;
  sceneTitle?: string;
  audioPrompt?: string;
};

export default function BackgroundMusicPlayer({ sceneMood, sceneTitle, audioPrompt }: Props) {
  const [trackUrl, setTrackUrl] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let mounted = true;
    async function fetchTrack() {
      setLoading(true);
      try {
        const res = await fetch('/api/background-music', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sceneMood, sceneTitle, audioPrompt })
        });
        const data = await res.json();
        if (!mounted) return;
        setTrackUrl(data.trackUrl);
        setTitle(data.title ?? `Ambient ${sceneMood ?? ''}`);
      } catch (err) {
        if (!mounted) return;
        setTrackUrl('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3');
        setTitle(`Ambient ${sceneMood ?? ''}`);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchTrack();
    return () => { mounted = false; };
  }, [sceneMood, sceneTitle, audioPrompt]);

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="text-sm text-white/70">{title ?? (loading ? 'Loading music...' : 'No music')}</p>
        </div>
        <div>
          {trackUrl ? (
            <div className="flex items-center gap-2">
              <audio ref={audioRef} src={trackUrl} controls className="w-48" />
            </div>
          ) : (
            <span className="text-sm text-white/50">No track</span>
          )}
        </div>
      </div>
    </div>
  );
}
