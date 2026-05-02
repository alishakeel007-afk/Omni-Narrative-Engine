import type { StoryCharacter } from "@/types/story";

type CharacterPanelProps = {
  primaryCharacter: StoryCharacter;
  sceneCharacters: StoryCharacter[];
};

export function CharacterPanel({
  primaryCharacter,
  sceneCharacters
}: CharacterPanelProps) {
  return (
    <section className="glass-panel rounded-[2rem] p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-starlight/80">Character Panel</p>
          <h3 className="mt-2 font-[var(--font-heading)] text-2xl text-white">Character Overview</h3>
        </div>
        <span className="rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-xs text-gold">
          Multi-Character Scene
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        <div className="rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(111,92,255,0.18),transparent_30%),linear-gradient(180deg,#131933,#090e21)] p-4">
          <div className="flex h-72 items-end rounded-[1.3rem] border border-white/10 bg-black/20 p-4">
            <p className="text-sm text-white/55">{primaryCharacter.imageLabel}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <PanelField label="Character Name" value={primaryCharacter.name} />
          <PanelField label="Role" value={primaryCharacter.role} />
          <PanelField label="Current Emotional State" value={primaryCharacter.emotionalState} />
          <PanelField label="Visual Appearance" value={primaryCharacter.visualAppearance} />
          <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4 sm:col-span-2">
            <p className="text-xs uppercase tracking-[0.26em] text-white/45">Personality Traits</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(primaryCharacter.traits ?? []).length === 0 ? (
                <p className="text-sm text-white/60">No traits specified</p>
              ) : (
                (primaryCharacter.traits ?? []).map((trait) => (
                  <span
                    key={trait}
                    className="rounded-full border border-starlight/15 bg-starlight/10 px-3 py-1 text-xs text-starlight"
                  >
                    {trait}
                  </span>
                ))
              )}
            </div>
          </div>
          <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4 sm:col-span-2">
            <p className="text-xs uppercase tracking-[0.26em] text-white/45">Relationships</p>
            <div className="mt-3 space-y-3">
              {(primaryCharacter.relationships ?? []).length === 0 ? (
                <p className="text-sm text-white/60">No relationships defined</p>
              ) : (
                (primaryCharacter.relationships ?? []).map((relationship) => (
                  <p key={relationship} className="text-sm leading-7 text-white/70">
                    {relationship}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scene cast moved to StoryScreen for clearer separation of concerns */}
    </section>
  );
}

function PanelField({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.26em] text-white/45">{label}</p>
      <p className="mt-3 text-sm leading-7 text-white/78">{value || "—"}</p>
    </div>
  );
}
