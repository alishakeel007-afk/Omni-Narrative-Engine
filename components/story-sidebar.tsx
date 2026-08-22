import type { HealthStatus } from "@/types/story";
import { HeartPulse, RefreshCcw, ScrollText, Sword } from "lucide-react";

type StorySidebarProps = {
  storyTitle: string;
  currentChapter: string;
  characterName: string;
  currentLocation: string;
  genre: string;
  healthStatus: HealthStatus;
  inventory: string[];
  mood: string;
  lastSavedAt: string | null;
  onMemoryOpen: () => void;
  onRestart: () => void;
};

export function StorySidebar({
  storyTitle,
  currentChapter,
  characterName,
  currentLocation,
  genre,
  healthStatus,
  inventory,
  mood,
  lastSavedAt,
  onMemoryOpen,
  onRestart
}: StorySidebarProps) {
  return (
    <aside className="glass-panel rounded-[2rem] p-5">
      <p className="text-xs uppercase tracking-[0.3em] text-starlight/80">Current Run</p>
      <h2 className="mt-3 font-[var(--font-heading)] text-2xl text-white">{storyTitle}</h2>

      <div className="mt-6 space-y-4 text-sm">
        <SidebarField label="Current Chapter" value={currentChapter} />
        <SidebarField label="Character Name" value={characterName} />
        <SidebarField label="Genre" value={genre} />
        <SidebarField label="Mood" value={mood} />
        <SidebarField label="Current Location" value={currentLocation} />
      </div>

      <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
          <Sword className="h-4 w-4 text-gold" />
          Inventory
        </div>
        <div className="flex flex-wrap gap-2">
          {inventory.map((item) => (
            <span
              key={item}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/90"
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
          <HeartPulse className="h-4 w-4 text-starlight" />
          Health / Status
        </div>
        <div className="space-y-3">
          <StatusBar label="Health" value={healthStatus.health} color="from-starlight to-emerald-300" />
          <StatusBar label="Resolve" value={healthStatus.resolve} color="from-gold to-orange-300" />
          <StatusBar label="Mana" value={healthStatus.mana} color="from-aurora to-starlight" />
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        <button
          type="button"
          onClick={onMemoryOpen}
          className="flex items-center justify-center gap-2 rounded-full border border-starlight/20 bg-starlight/10 px-4 py-3 text-sm font-semibold text-starlight transition hover:bg-starlight/15"
        >
          <ScrollText className="h-4 w-4" />
          Story Memory
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80 transition hover:border-gold/20 hover:text-white"
        >
          <RefreshCcw className="h-4 w-4" />
          Restart Story
        </button>
        <div className="rounded-[1.35rem] border border-white/10 bg-black/20 p-4 text-xs leading-6 text-white/85">
          Local Save:
          <span className="ml-2 text-white/78">
            {lastSavedAt ? lastSavedAt : "Not synced yet"}
          </span>
        </div>
        <div className="rounded-[1.35rem] border border-gold/15 bg-gold/5 p-4 text-xs leading-6 text-white/90">
          The hybrid flow keeps guided options visible while always allowing your own custom action.
        </div>
      </div>
    </aside>
  );
}

function SidebarField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.2rem] border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-white/75">{label}</p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function StatusBar({
  label,
  value,
  color
}: {
  label: string;
  value: number;
  color: string;
}) {
  const width = `${value}%`;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-white/85">
        <span>{label}</span>
        <span>{width}</span>
      </div>
      <div className="h-2 rounded-full bg-white/10">
        <div className={`h-full rounded-full bg-gradient-to-r ${color}`} style={{ width }} />
      </div>
    </div>
  );
}
