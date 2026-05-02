type CustomChoiceInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSelect: () => boolean | void;
};

export function CustomChoiceInput({ value, onChange, onSelect }: CustomChoiceInputProps) {
  const handleSelect = () => {
    const result = onSelect();

    if (result === false) {
      return;
    }
  };

  return (
    <div className="rounded-[1.75rem] border border-starlight/15 bg-starlight/5 p-5">
      <label htmlFor="custom-choice" className="text-sm font-semibold text-white">
        Or write your own action
      </label>
      <textarea
        id="custom-choice"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Example: I secretly follow the stranger and hide behind the broken wall..."
        className="mt-3 min-h-32 w-full rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-gold/30"
      />
      <button
        type="button"
        onClick={handleSelect}
        className="mt-4 rounded-full bg-gradient-to-r from-aurora to-starlight px-5 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.02]"
      >
        Use My Choice
      </button>
      {!value.trim() ? (
        <p className="mt-3 text-xs leading-6 text-white/52">
          Enter a custom action to replace the AI suggested choice.
        </p>
      ) : null}
    </div>
  );
}
