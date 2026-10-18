"use client";

import { ArrowUpRight, Plus } from "lucide-react";
import { useState } from "react";
import { HeroSection } from "@/components/hero-section";
import { CinematicVideo, PublicMotion } from "@/components/public/cinematic-video";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import GuestStudioScreen from "@/screens/GuestStudioScreen";
import type { StudioTab } from "@/types/studio";

const steps: { tab: StudioTab; title: string; text: string }[] = [
  { tab: "plan", title: "Find your story.", text: "Explore an idea, shape your characters, and find your direction." },
  { tab: "scenes", title: "Make it a world.", text: "Create images and video. Choose the takes that bring your story to life." },
  { tab: "assemble", title: "Bring it all together.", text: "Arrange your scenes, add sound, and make the final cut." },
];

const questions = [
  ["No idea yet?", "Start with ‘Help me find an idea.’ Explore a few directions and choose one to develop."],
  ["Can I bring a script or character?", "Yes. In your studio, paste a script or upload character references to build on what you have."],
  ["Will my characters stay consistent?", "Lock your character references before creating scenes. Appearance checks flag mismatched takes; review each result before using it."],
  ["Can I edit before downloading?", "Choose takes, reorder and trim clips, then mix dialogue and music. Download your film as a WebM video."],
];

export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState<StudioTab>("plan");
  return (
    <PublicMotion>
      <div className="public-site">
        <a className="public-skip" href="#main-story">Skip to content</a>
        <PublicHeader />
        <div id="main-story" tabIndex={-1}>
          <HeroSection />
          <section id="how-it-works" className="public-workflow public-section">
            <div className="public-section-heading">
              <div>
                <span className="public-eyebrow">A LITTLE GUIDANCE. A LOT OF POSSIBILITY.</span>
                <h2>Big ideas.<br />Three simple steps.</h2>
              </div>
              <p>No complicated workflow.<br />Just a conversation that becomes a story.</p>
            </div>
            <div className="public-workflow-grid">
              <div className="public-step-list" aria-label="Story creation steps">
                {steps.map((step, index) => (
                  <button
                    key={step.tab}
                    type="button"
                    className={`public-step ${activeTab === step.tab ? "active" : ""}`}
                    aria-pressed={activeTab === step.tab}
                    aria-controls="trial-conversation"
                    onClick={() => setActiveTab(step.tab)}
                  >
                    <span className="public-step-number">0{index + 1}</span>
                    <div>
                      <span className="public-step-label">{step.tab}</span>
                      <h3>{step.title}</h3>
                      <p>{step.text}</p>
                    </div>
                    <ArrowUpRight className="public-step-arrow" size={18} />
                  </button>
                ))}
              </div>
              <GuestStudioScreen embedded activeTab={activeTab} onTabChange={setActiveTab} />
            </div>
          </section>
          <section id="possibilities" className="public-possibilities public-section">
            <div className="public-section-heading">
              <div>
                <span className="public-eyebrow">MAKE ROOM FOR THE UNEXPECTED.</span>
                <h2>Where will your story go?</h2>
              </div>
              <p>A new world starts with your next idea.</p>
            </div>
            <div className="public-film-grid">
              {[
                { film: "emerald-world" as const, label: "01 / FANTASY", title: "Imagine another world.", prompt: "Help me find a fantasy story idea." },
                { film: "forest-light" as const, label: "02 / ADVENTURE", title: "Follow your curiosity.", prompt: "Help me find an adventure story idea." },
              ].map(({ film, label, title, prompt }) => (
                <article className="public-film-card" key={film}>
                  <CinematicVideo film={film} />
                  <div className="public-film-card-shade" />
                  <div className="public-film-card-copy">
                    <span>{label}</span>
                    <h3>{title}</h3>
                    <button type="button" aria-label={`Explore ${label.includes("FANTASY") ? "fantasy" : "adventure"} ideas`} onClick={() => {
                      window.dispatchEvent(new CustomEvent("omni:home-prompt", { detail: prompt }));
                      document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
                    }}><ArrowUpRight size={22} /></button>
                  </div>
                </article>
              ))}
            </div>
            <p className="public-film-footnote">Generated scenes. Your story could be next.</p>
          </section>
          <section id="questions" className="public-faq public-section">
            <div><span className="public-eyebrow">GOOD TO KNOW.</span><h2>A little clarity.</h2></div>
            <div className="public-faq-list">
              {questions.map(([question, answer]) => (
                <details key={question}><summary>{question}<Plus size={19} /></summary><p>{answer}</p></details>
              ))}
            </div>
          </section>
          <section className="public-final-cta">
            <CinematicVideo film="forest-light" />
            <div className="public-final-shade" />
            <div>
              <span className="public-eyebrow light">YOUR NEXT CHAPTER.</span>
              <h2>A story only <em>you could tell.</em></h2>
              <a href="#how-it-works" className="public-button public-button-lime">Start your story<ArrowUpRight size={18} /></a>
            </div>
          </section>
        </div>
        <PublicFooter />
      </div>
    </PublicMotion>
  );
}
