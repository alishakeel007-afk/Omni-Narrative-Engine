import Link from "next/link";
import { FeatureCard } from "@/components/feature-card";
import { HeroSection } from "@/components/hero-section";
import { featureCards } from "@/lib/mock-data";

export default function HomeScreen() {
  return (
    <div className="pb-20 relative">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(168,85,247,0.06),transparent_30%)]" />
      <HeroSection />

      <section id="features" className="px-2 py-8 sm:px-4 lg:px-6">
        <div className="mx-auto max-w-[1500px]">
          <div className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-starlight/80">
                Core Features
              </p>
              <h2 className="mt-3 font-[var(--font-heading)] text-3xl text-white sm:text-4xl">
                Core Features of Omni-Narrative Engine
              </h2>
            </div>
            <p className="max-w-2xl text-sm leading-7 text-white/90">
              Everything needed to create interactive, consistent, and multimedia AI stories.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {featureCards.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>
        </div>
      </section>

      <section className="px-2 pt-12 sm:px-4 lg:px-6">
        <div className="mx-auto max-w-[1500px]">
          <div className="glass-panel rounded-[2rem] p-6 sm:p-8 lg:p-10">
            <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr]">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-gold">Why Omni-Narrative Engine Stands Out</p>
                <h2 className="mt-3 font-[var(--font-heading)] text-3xl text-white sm:text-4xl">
                  The user is never locked into one path.
                </h2>
                <p className="mt-5 max-w-2xl text-base leading-8 text-white/90">
                  Users can follow AI-guided choices, write their own story direction, or build a complete cinematic story through AI Story Studio. This makes the system flexible for both beginners and creative users.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ["AI Guided Story Mode", "Best for users who want the system to guide the story."],
                  ["AI Story Studio", "Best for users who want to build a complete story and video-ready script."],
                  ["Hybrid Flow", "Users can combine AI suggestions with their own custom input."],
                  ["Story Memory", "The system tracks decisions, characters, and locations for continuity."]
                ].map(([title, description]) => (
                  <div
                    key={title}
                    className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5"
                  >
                    <h3 className="text-lg font-semibold text-white">{title}</h3>
                    <p className="mt-3 text-sm leading-7 text-white/90">{description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/story/mode"
                className="rounded-full bg-gradient-to-r from-aurora to-gold px-7 py-4 text-center text-sm font-semibold text-slate-950"
              >
                Start Guided Story
              </Link>
              <Link
                href="/setup"
                className="rounded-full border border-white/10 bg-white/5 px-7 py-4 text-center text-sm font-semibold text-white/82"
              >
                Open AI Story Studio
              </Link>
              <Link
                href="/story/memory"
                className="rounded-full border border-gold/20 bg-gold/10 px-7 py-4 text-center text-sm font-semibold text-gold"
              >
                View Memory Board
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
