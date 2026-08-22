type GenreCardProps = {
  genre: string;
  selected: boolean;
  onClick: () => void;
};

export function GenreCard({ genre, selected, onClick }: GenreCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[1.35rem] border p-4 text-left transition ${
        selected
          ? "border-gold/40 bg-gold/10 text-white shadow-glow"
          : "border-white/10 bg-white/5 text-white/75 hover:border-starlight/25 hover:bg-white/10"
      }`}
    >
      <span className="text-sm font-semibold">{genre}</span>
    </button>
  );
}
