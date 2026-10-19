import {
  CinematicVideo,
  MotionToggle,
} from "@/components/public/cinematic-video";

export function HeroSection() {
  return (
    <section className="public-hero" aria-labelledby="public-hero-heading">
      <div className="public-hero-panel">
        <CinematicVideo film="hero-story" priority audioControl />
        <div className="public-hero-shade" />
        <div className="public-hero-copy">
          <span className="public-eyebrow light">
            <span className="public-live-dot" />
            YOUR CREATIVE DIRECTOR PARTNER
          </span>
          <h1 id="public-hero-heading">
            Your story. <em>Ready for the screen.</em>
          </h1>
          <p>
            From first idea to final story. Create with a director by your side.
          </p>
          <div className="public-hero-actions">
            <a href="#trial-conversation" className="public-button public-button-lime">
              Start your story
            </a>
          </div>
        </div>
        <div className="public-hero-motion">
          <MotionToggle compact />
        </div>
      </div>
      <div className="public-hero-bottom">
        <span>From first spark to final frame.</span>
        <div>
          <span>YOUR IDEAS</span>
          <i />
          <span>YOUR CHARACTERS</span>
          <i />
          <span>YOUR CALL</span>
        </div>
      </div>
    </section>
  );
}
