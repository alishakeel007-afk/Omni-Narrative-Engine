"use client";

import { useState } from "react";

const clips = [
  { title: "The discovery", film: "emerald-world" },
  { title: "A hidden path", film: "forest-light" },
  { title: "The return", film: "emerald-world" },
];

export function AssemblyPreview() {
  const [selected, setSelected] = useState(0);
  const clip = clips[selected];
  return (
    <section className="public-assembly" aria-label="Assemble editor preview">
      <header>
        <div><span className="public-eyebrow">EDITOR PREVIEW</span><h3>Your story, in sequence.</h3></div>
        <span className="public-assembly-format">WEBM</span>
      </header>
      <video
        key={selected}
        controls
        muted
        playsInline
        preload="none"
        poster={`/films/${clip.film}-poster.jpg`}
        aria-label={`Preview ${clip.title}`}
      >
        <source src={`/films/${clip.film}-web.mp4`} type="video/mp4" />
      </video>
      <div className="public-assembly-sequence" role="group" aria-label="Example scene sequence">
        {clips.map((item, index) => (
          <button
            key={item.title}
            type="button"
            aria-pressed={selected === index}
            onClick={() => setSelected(index)}
          >
            <img src={`/films/${item.film}-poster.jpg`} alt="" loading="lazy" />
            <span>0{index + 1} {item.title}</span>
          </button>
        ))}
      </div>
      <div className="public-assembly-track"><span>Dialogue</span><i aria-hidden="true" /></div>
      <div className="public-assembly-track"><span>Music</span><i aria-hidden="true" /></div>
      <p>Arrange scenes. Trim clips. Mix sound. Export.</p>
      <small>Example footage. Edit your own film in your studio.</small>
    </section>
  );
}
