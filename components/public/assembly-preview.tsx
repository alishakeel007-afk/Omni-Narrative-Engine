"use client";

import { useState } from "react";
import { showreelClip } from "@/lib/film/showreel";

const clips = [
  { title: "The discovery", film: "emerald-world" },
  { title: "A hidden path", film: "forest-light" },
  { title: "The return", film: "emerald-world" },
];

export function AssemblyPreview() {
  const [selected, setSelected] = useState(0);
  const clip = clips[selected];
  const media = showreelClip(clip.film);
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
        src={media.src}
        poster={media.poster}
        aria-label={`Preview ${clip.title}`}
      />
      <div className="public-assembly-sequence" role="group" aria-label="Example scene sequence">
        {clips.map((item, index) => (
          <button
            key={item.title}
            type="button"
            aria-pressed={selected === index}
            onClick={() => setSelected(index)}
          >
            {showreelClip(item.film).poster ? <img src={showreelClip(item.film).poster} alt="" loading="lazy" /> : null}
            <span>0{index + 1} {item.title}</span>
          </button>
        ))}
      </div>
      <div className="public-assembly-track"><span>Dialogue</span><i aria-hidden="true" /></div>
      <div className="public-assembly-track"><span>Music</span><i aria-hidden="true" /></div>
      <p>Arrange scenes. Trim clips. Mix sound. Export.</p>
      <small>Example footage. Edit your own story in your studio.</small>
    </section>
  );
}
