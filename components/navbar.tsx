"use client";

import Link from "next/link";
import type { Route } from "next";
import { Menu, Sparkles, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { navLinks } from "@/lib/mock-data";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, loading, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const hiddenHeaderPaths = ["/", "/auth", "/signup"];

  if (hiddenHeaderPaths.includes(pathname)) {
    return null;
  }

  const handleLogout = async () => {
    await logout();
    router.push("/auth");
    setMenuOpen(false);
  };
  const brandHref = (currentUser ? "/story/mode" : "/") as Route;

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[rgba(8,5,24,0.82)] backdrop-blur-2xl shadow-glow">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href={brandHref} className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/10 shadow-glow">
            <Sparkles className="h-5 w-5 text-gold" />
          </div>
          <div>
            <p className="font-[var(--font-heading)] text-lg tracking-[0.24em] text-white/90">
              OMNI-NARRATIVE
            </p>
            <p className="text-xs uppercase tracking-[0.3em] text-starlight/80">Engine</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          {navLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                pathname === item.href
                  ? "border-gold/30 bg-gold/10 text-gold"
                  : "border-white/10 text-white/80 hover:border-starlight/30 hover:bg-white/10 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          ))}

          {!loading && !currentUser ? (
            <>
              <Link
                href="/auth"
                className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/80 transition hover:border-starlight/30 hover:bg-white/10 hover:text-white"
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-gradient-to-r from-aurora to-gold px-4 py-2 text-sm font-semibold text-slate-950 transition hover:scale-[1.02]"
              >
                Sign Up
              </Link>
            </>
          ) : null}

          {!loading && currentUser ? (
            <>
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">
                {currentUser.displayName || currentUser.email}
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/80 transition hover:border-starlight/30 hover:bg-white/10 hover:text-white"
              >
                Logout
              </button>
            </>
          ) : null}
        </nav>

        <button
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10 md:hidden"
          aria-label="Toggle navigation menu"
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {menuOpen ? (
        <div className="border-t border-white/10 px-4 pb-4 md:hidden">
          <nav className="mx-auto mt-4 grid max-w-7xl gap-2">
            {navLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={`rounded-[1.2rem] border px-4 py-3 text-sm transition ${
                  pathname === item.href
                    ? "border-gold/30 bg-gold/10 text-gold"
                    : "border-white/10 bg-white/5 text-white/80 hover:border-starlight/30 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            ))}

            {!loading && !currentUser ? (
              <>
                <Link
                  href="/auth"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-[1.2rem] border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 transition hover:border-starlight/30 hover:bg-white/10 hover:text-white"
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-[1.2rem] bg-gradient-to-r from-aurora to-gold px-4 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.01]"
                >
                  Sign Up
                </Link>
              </>
            ) : null}

            {!loading && currentUser ? (
              <>
                <div className="rounded-[1.2rem] border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
                  {currentUser.displayName || currentUser.email}
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-[1.2rem] border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white/80 transition hover:border-starlight/30 hover:bg-white/10 hover:text-white"
                >
                  Logout
                </button>
              </>
            ) : null}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
