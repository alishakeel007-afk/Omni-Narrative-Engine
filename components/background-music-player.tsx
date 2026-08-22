"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  sceneMood?: string;
  sceneTitle?: string;
  audioPrompt?: string;
  sceneId?: string;
  projectId?: string;
};

export default function BackgroundMusicPlayer({ sceneMood, sceneTitle, audioPrompt, sceneId, projectId }: Props) {
  const [trackUrl, setTrackUrl] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!sceneId) return;
    let mounted = true;
    async function fetchTrack() {
      setLoading(true);
      try {
        const res = await fetch('/api/background-music', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mood: sceneMood,
            sceneTitle,
            soundDesign: audioPrompt,
            sceneId,
            projectId
          })
        });
        const data = await res.json();
        if (!mounted) return;
        if (!res.ok || !data.audioUrl) {
          throw new Error(data.error ?? "Background music generation failed.");
        }
        setTrackUrl(data.audioUrl);
        setTitle(`Ambient ${sceneMood ?? ''}`);
      } catch (err) {
        if (!mounted) return;
        setTrackUrl(null);
        setTitle(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchTrack();
    return () => { mounted = false; };
  }, [sceneMood, sceneTitle, audioPrompt, sceneId, projectId]);

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
            <span className="text-sm text-white/85">No track</span>
          )}
        </div>
      </div>
    </div>
  );
}
