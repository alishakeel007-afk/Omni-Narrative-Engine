type ModeSelectionCardProps = {
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
};

export function ModeSelectionCard({
  title,
  description,
  selected,
  onClick
}: ModeSelectionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[1.5rem] border p-5 text-left transition ${
        selected
          ? "border-starlight/40 bg-starlight/10 shadow-glow"
          : "border-white/10 bg-white/5 hover:border-gold/25 hover:bg-white/10"
      }`}
    >
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-7 text-white/90">{description}</p>
    </button>
  );
}
