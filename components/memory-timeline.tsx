import type { MemoryItem } from "@/types/story";

type MemoryTimelineProps = {
  items: MemoryItem[];
};

export function MemoryTimeline({ items }: MemoryTimelineProps) {
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div
          key={`${item.sceneNumber}-${item.userChoice}-${item.timestamp}`}
          className="relative rounded-[1.5rem] border border-white/10 bg-white/5 p-5 pl-8"
        >
          <div className="absolute bottom-6 left-4 top-6 w-px bg-gradient-to-b from-starlight via-gold/70 to-transparent" />
          <div className="absolute left-[11px] top-6 h-3 w-3 rounded-full bg-gold shadow-[0_0_18px_rgba(241,201,121,0.65)]" />
          <p className="text-xs uppercase tracking-[0.26em] text-gold">Scene {item.sceneNumber}</p>
          <p className="mt-2 text-xs uppercase tracking-[0.22em] text-starlight/78">
            {item.choiceType} • {item.mood} • {item.location}
          </p>
          <p className="mt-3 text-sm font-semibold text-white">Choice: {item.userChoice}</p>
          <p className="mt-2 text-sm leading-7 text-white/68">Result: {item.result}</p>
          <p className="mt-2 rounded-2xl border border-starlight/15 bg-starlight/5 px-4 py-3 text-sm leading-7 text-starlight/90">
            Story Update: {item.update}
          </p>
          <p className="mt-3 text-xs text-white/45">{item.timestamp}</p>
        </div>
      ))}
    </div>
  );
}
