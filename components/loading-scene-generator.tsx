export function LoadingSceneGenerator() {
  return (
    <div className="rounded-[1.75rem] border border-starlight/20 bg-starlight/10 p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-white">Generating your next scene...</p>
          <p className="mt-1 text-xs uppercase tracking-[0.24em] text-starlight/78">
            Syncing choice, memory, and media placeholders
          </p>
        </div>
        <div className="h-3 w-20 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-full animate-shimmer bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.6),transparent)] bg-[length:200%_100%]" />
        </div>
      </div>
      <div className="h-2 rounded-full bg-white/10">
        <div className="h-full w-2/3 animate-pulseSlow rounded-full bg-gradient-to-r from-aurora via-starlight to-gold" />
      </div>
    </div>
  );
}
