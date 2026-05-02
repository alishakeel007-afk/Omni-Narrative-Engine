import type { MemoryItem } from "@/types/story";
import { X } from "lucide-react";
import { MemoryTimeline } from "@/components/memory-timeline";

type StoryMemoryModalProps = {
  items: MemoryItem[];
  onClose: () => void;
  open: boolean;
};

export function StoryMemoryModal({ open, onClose, items }: StoryMemoryModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm">
      <div className="glass-panel max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-starlight/80">Story Memory</p>
            <h3 className="mt-2 font-[var(--font-heading)] text-3xl text-white">
              Timeline of Choices and Consequences
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {items.length > 0 ? (
          <MemoryTimeline items={items} />
        ) : (
          <div className="rounded-[1.6rem] border border-white/10 bg-white/5 p-6 text-sm leading-7 text-white/65">
            No memory items yet. Continue the story once and your decisions will appear here.
          </div>
        )}
      </div>
    </div>
  );
}
