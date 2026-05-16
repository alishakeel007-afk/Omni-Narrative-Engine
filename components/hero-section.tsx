import Link from "next/link";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden px-2 pb-20 pt-14 sm:px-4 lg:px-6 lg:pb-24 lg:pt-24">
      <div className="mx-auto grid max-w-[1500px] items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <div className="mb-6 inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs uppercase tracking-[0.32em] text-gold shadow-sm">
            Cinematic AI Studio
          </div>
          <h1 className="max-w-4xl font-[var(--font-heading)] text-4xl leading-tight text-white sm:text-5xl lg:text-7xl">
            <span className="text-gradient">Create cinematic AI stories with dialogue,</span>
            <br />
            <span className="text-white">voice, music, and video-ready scenes.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-white/72 sm:text-lg">
            Omni-Narrative Engine is an AI-powered storytelling platform where users can build guided adventures, create custom stories, generate character dialogues, add narration, compose background music, and preview video-ready scenes.
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Link
              href="/auth?next=/story/mode"
              className="rounded-full bg-gradient-to-r from-aurora via-starlight to-gold px-7 py-4 text-center text-sm font-semibold text-slate-950 shadow-glow transition hover:scale-[1.02]"
            >
              Start Your Story
            </Link>
            <Link
              href="/auth?next=/video"
              className="rounded-full border border-white/15 bg-white/10 px-7 py-4 text-center text-sm font-semibold text-white/90 backdrop-blur-sm transition hover:bg-white/20"
            >
              Open AI Story Studio
            </Link>
          </div>
        </div>

        <div className="glass-panel gold-ring rounded-[2rem] p-5 sm:p-6">
          <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-slate-500">
                  Story Preview
                </p>
                <h2 className="mt-2 font-[var(--font-heading)] text-2xl text-slate-950">
                  The Whispering Gate
                </h2>
              </div>
              <span className="rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
                Scene 1
              </span>
            </div>

            <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                  Guided Story
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                  Suspenseful
                </span>
                <span className="rounded-full border border-gold/20 bg-white px-3 py-1 text-xs font-semibold text-gold">
                  Memory Active
                </span>
              </div>
              <div className="mt-8 space-y-4">
                <div className="h-2 w-28 rounded-full bg-blue-600" />
                <p className="max-w-md text-sm leading-7 text-slate-700">
                  The ancient gate trembles as blue light leaks through broken symbols. Your next decision will shape the story path.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {["AI Choices", "Custom Input", "Memory Sync"].map((item) => (
                    <div
                      key={item}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
