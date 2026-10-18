"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { CinematicVideo, MotionToggle, PublicMotion } from "./cinematic-video";

export function PublicBrand() {
  return (
    <Link href="/" className="public-brand" aria-label="OmniNarrative home">
      <span className="public-brand-symbol" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none">
          <path d="M7 24V8h5l8 12V8h5v16h-5L12 12v12H7Z" fill="currentColor" />
          <circle cx="23" cy="3" r="2.5" fill="var(--brand-accent)" />
        </svg>
      </span>
      <span>
        omni<span className="public-brand-light">narrative</span>
        <span className="public-brand-dot">.</span>
      </span>
    </Link>
  );
}
const links = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#possibilities", label: "The possibilities" },
  { href: "/#questions", label: "Good to know" },
];

export function PublicHeader({ account = false }: { account?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, []);
  return (
    <header className="public-header">
      <div className="public-header-inner">
        <PublicBrand />
        <nav className="public-desktop-nav" aria-label="Main navigation">
          {links.map((link) => (
            <Link href={link.href} key={link.label}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="public-header-actions">
          <Link className="public-login-link" href="/auth?next=/studio">
            Log in
          </Link>
          <Link
            className="public-button public-button-small"
            href="/signup?next=/studio"
          >
            {account ? "Start your story" : "Start creating"}
            <ArrowUpRight size={15} />
          </Link>
          <button
            className="public-menu-toggle"
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls="public-mobile-nav"
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="public-mobile-nav"
          className="public-mobile-nav"
          aria-label="Mobile navigation"
        >
          {links.map((link) => (
            <Link
              href={link.href}
              key={link.label}
              onClick={() => setOpen(false)}
            >
              {link.label}
              <ArrowUpRight size={17} />
            </Link>
          ))}
          <Link href="/auth?next=/studio" onClick={() => setOpen(false)}>
            Log in
            <ArrowUpRight size={17} />
          </Link>
        </nav>
      )}
    </header>
  );
}

export function PublicFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={`public-footer ${compact ? "compact" : ""}`}>
      <div className="public-footer-main">
        <div>
          <PublicBrand />
          {!compact && (
            <p>
              A little imagination. A creative director.
              <br />A story that’s entirely yours.
            </p>
          )}
        </div>
        <div className="public-footer-links">
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/#questions">Questions</Link>
          <Link href="/auth?next=/studio">
            Your studio
            <ArrowUpRight size={13} />
          </Link>
        </div>
      </div>
      <div className="public-footer-bottom">
        <span>© 2026 OmniNarrative</span>
        <span>Made for the storyteller in you.</span>
        <MotionToggle />
      </div>
    </footer>
  );
}

export function PublicAccountShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: React.ReactNode;
}) {
  return (
    <PublicMotion>
      <div className="public-site public-account-site">
        <a className="public-skip" href="#account-form">
          Skip to form
        </a>
        <PublicHeader account />
        <div className="public-account-layout">
          <aside className="public-account-scene">
            <CinematicVideo film="forest-light" priority />
            <div className="public-account-shade" />
            <div className="public-account-scene-copy">
              <span className="public-eyebrow light">
                <span className="public-live-dot" />
                YOUR CREATIVE DIRECTOR PARTNER
              </span>
              <h2>
                Your next story.<br /><em>Starts here.</em>
              </h2>
              <p>
                Plan. Create. Make it yours.
              </p>
              <div className="public-account-steps">
                <span>01 Plan</span>
                <ArrowRight size={14} />
                <span>02 Create</span>
                <ArrowRight size={14} />
                <span>03 Assemble</span>
              </div>
            </div>
            <div className="public-account-film-label">
              <span>Original AI-generated scene</span>
              <MotionToggle compact />
            </div>
          </aside>
          <div className="public-account-form-wrap">
            <div
              id="account-form"
              className="public-account-form"
              tabIndex={-1}
              aria-label={typeof title === "string" ? title : "Account form"}
            >
              {children}
            </div>
            <p className="public-account-footnote">
              Your next chapter is waiting.
            </p>
          </div>
        </div>
        <PublicFooter compact />
      </div>
    </PublicMotion>
  );
}
