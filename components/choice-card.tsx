type ChoiceCardProps = {
  text: string;
  selected: boolean;
  onClick: () => void;
};

export function ChoiceCard({ text, selected, onClick }: ChoiceCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[1.5rem] border p-4 text-left transition ${
        selected
          ? "border-gold/40 bg-gold/10 shadow-glow"
          : "border-white/10 bg-white/5 hover:border-starlight/25 hover:bg-white/10"
      }`}
    >
      <span className="text-sm leading-7 text-white/88">{text}</span>
    </button>
  );
}
