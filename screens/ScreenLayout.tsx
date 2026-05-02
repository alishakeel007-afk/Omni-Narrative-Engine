"use client";

import React from "react";

export default function ScreenLayout({
  eyebrow,
  title,
  description,
  children,
  maxWidth = "max-w-4xl"
}: {
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <section className="relative px-4 py-16 sm:px-6 lg:px-8">
      <div className={`mx-auto ${maxWidth}`}>
        {(eyebrow || title || description) && (
          <div className="mb-10">
            {eyebrow ? (
              <p className="text-xs uppercase tracking-[0.32em] text-starlight/80">{eyebrow}</p>
            ) : null}

            {title ? (
              <h1 className="mt-3 font-[var(--font-heading)] text-4xl text-white sm:text-5xl">
                {title}
              </h1>
            ) : null}

            {description ? (
              <p className="mt-4 text-sm leading-7 text-white/68">{description}</p>
            ) : null}
          </div>
        )}

        {children}
      </div>
    </section>
  );
}
