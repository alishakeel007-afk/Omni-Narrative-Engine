import Link from "next/link";
import { FeatureCard } from "@/components/feature-card";
import { HeroSection } from "@/components/hero-section";
import { featureCards } from "@/lib/mock-data";

export default function HomeScreen() {
  return (
    <div className="pb-20 relative">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(168,85,247,0.06),transparent_30%)]" />
      <HeroSection />

      <section id="features" className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-starlight/80">
                Core Features
              </p>
              <h2 className="mt-3 font-[var(--font-heading)] text-3xl text-white sm:text-4xl">
                Premium Frontend for Branching AI Stories
              </h2>
            </div>
            <p className="max-w-2xl text-sm leading-7 text-white/65">
              Designed for a final year project demo with a cinematic interface, reusable
              components, and a clear path for future API integration.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {featureCards.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pt-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="glass-panel rounded-[2rem] p-6 sm:p-8 lg:p-10">
            <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr]">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-gold">Why It Stands Out</p>
                <h2 className="mt-3 font-[var(--font-heading)] text-3xl text-white sm:text-4xl">
                  The user is never locked into one path.
                </h2>
                <p className="mt-5 max-w-2xl text-base leading-8 text-white/68">
                  Omni-Narrative Engine combines guided AI option cards with a persistent custom
                  action input. Users can follow the system, diverge on demand, and still preserve
                  narrative memory, media context, and character consistency.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ["Guided Mode", "AI presents clean, readable decision options every scene."],
                  ["Custom Mode", "Writers can define the story from start to finish with free input."],
                  ["Hybrid Flow", "Custom input remains visible even while guided options are shown."],
                  ["Extensible Structure", "Prepared for backend APIs, scene generation, and media services."]
                ].map(([title, description]) => (
                  <div
                    key={title}
                    className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5"
                  >
                    <h3 className="text-lg font-semibold text-white">{title}</h3>
                    <p className="mt-3 text-sm leading-7 text-white/64">{description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/auth?next=/setup"
                className="rounded-full bg-gradient-to-r from-aurora to-gold px-7 py-4 text-center text-sm font-semibold text-slate-950"
              >
                Build Your Story Setup
              </Link>
              <Link
                href="/auth?next=/story/mode"
                className="rounded-full border border-white/10 bg-white/5 px-7 py-4 text-center text-sm font-semibold text-white/82"
              >
                Open Story Experience
              </Link>
              <Link
                href="/auth?next=/video"
                className="rounded-full border border-gold/20 bg-gold/10 px-7 py-4 text-center text-sm font-semibold text-gold"
              >
                Open Video Studio
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
