import Link from "next/link";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-14 sm:px-6 lg:px-8 lg:pb-24 lg:pt-24">
      <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <div className="mb-6 inline-flex items-center rounded-full border border-purple-300/20 bg-purple-300/10 px-4 py-2 text-xs uppercase tracking-[0.32em] text-gold">
            Cinematic AI Studio
          </div>
          <h1 className="max-w-4xl font-[var(--font-heading)] text-4xl leading-tight text-white sm:text-5xl lg:text-7xl">
            <span className="text-gradient">Create cinematic worlds,</span>
            <br />
            <span className="text-white">film-ready stories, and AI video scripts</span>
            <br />
            <span className="text-gradient">in minutes.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-white/72 sm:text-lg">
            An AI-powered cinematic studio built for filmmakers, editors, and creative storytellers who demand precision, speed, and luxury-grade output.
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Link
              href="/auth?next=/story/mode"
              className="rounded-full bg-gradient-to-r from-aurora via-starlight to-gold px-7 py-4 text-center text-sm font-semibold text-slate-950 shadow-glow transition hover:scale-[1.02]"
            >
              Launch Studio
            </Link>
            <a
              href="#features"
              className="rounded-full border border-white/15 bg-white/10 px-7 py-4 text-center text-sm font-semibold text-white/90 backdrop-blur-sm transition hover:bg-white/20"
            >
              Explore Demo
            </a>
          </div>
        </div>

        <div className="glass-panel gold-ring animate-float rounded-[2rem] p-5 sm:p-6">
          <div className="rounded-[1.6rem] border border-white/10 bg-[linear-gradient(160deg,rgba(169,92,247,0.24),rgba(7,9,23,0.82))] p-5">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-starlight/80">
                  Cinematic Preview
                </p>
                <h2 className="mt-2 font-[var(--font-heading)] text-2xl text-white">
                  The Whispering Gate
                </h2>
              </div>
              <span className="rounded-full border border-gold/20 bg-gold/20 px-3 py-1 text-xs text-gold">
                Scene 01
              </span>
            </div>

            <div className="relative h-72 overflow-hidden rounded-[1.4rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(141,183,255,0.3),transparent_30%),linear-gradient(160deg,#111633,#070b1d)]">
              <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(5,8,22,0.8))]" />
              <div className="absolute left-6 right-6 top-6 flex items-center justify-between">
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/70">
                  Location: Ruins of Vel Astra
                </span>
                <span className="rounded-full border border-starlight/20 bg-starlight/10 px-3 py-1 text-xs text-starlight">
                  Suspenseful
                </span>
              </div>
              <div className="absolute bottom-6 left-6 right-6 space-y-3">
                <div className="h-2 w-24 rounded-full bg-gradient-to-r from-starlight to-gold" />
                <p className="max-w-md text-sm leading-7 text-white/82">
                  The ancient gate trembles as blue light leaks through broken symbols while your
                  companion waits for your next move.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {["AI Choices", "Custom Input", "Memory Sync"].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/72"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
