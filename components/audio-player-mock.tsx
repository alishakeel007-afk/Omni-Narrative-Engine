import { Pause, Play, Volume2 } from "lucide-react";

export function AudioPlayerMock() {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-starlight/15 text-starlight"
          >
            <Play className="ml-0.5 h-5 w-5" />
          </button>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70"
          >
            <Pause className="h-5 w-5" />
          </button>
          <div>
            <p className="text-sm font-medium text-white">Narration Preview</p>
            <p className="text-xs uppercase tracking-[0.28em] text-white/45">00:42 / 02:15</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Volume2 className="h-4 w-4 text-white/55" />
          <div className="h-2 w-44 rounded-full bg-white/10">
            <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-starlight to-gold" />
          </div>
        </div>
      </div>
    </div>
  );
}
