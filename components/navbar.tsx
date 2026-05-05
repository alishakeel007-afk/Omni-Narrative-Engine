"use client";

import Link from "next/link";
import type { Route } from "next";
import { ChevronDown, LogOut, Menu, Settings, Sparkles, User, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { navLinks } from "@/lib/mock-data";

function ProfileDropdown({
  userName,
  userEmail,
  onLogout
}: {
  userName: string;
  userEmail: string;
  onLogout: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const initials = (userName || userEmail || "?")
    .charAt(0)
    .toUpperCase();

  const handleLink = (path: string) => {
    setIsOpen(false);
    router.push(path as Route);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1 pr-3 transition hover:border-gold/30 hover:bg-white/10"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-aurora to-gold text-sm font-bold text-slate-950">
          {initials}
        </div>
        <ChevronDown className={`h-4 w-4 text-white/70 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 origin-top-right rounded-2xl border border-white/10 bg-[rgba(15,10,25,0.95)] p-2 shadow-2xl backdrop-blur-xl">
          <div className="mb-2 border-b border-white/10 px-3 pb-3 pt-2">
            <p className="truncate text-sm font-semibold text-white">{userName || "User"}</p>
            <p className="truncate text-xs text-white/60">{userEmail}</p>
          </div>
          
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => handleLink("/dashboard")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <User className="h-4 w-4" />
              View Profile
            </button>
            <button
              type="button"
              onClick={() => handleLink("/reset-password")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <Settings className="h-4 w-4" />
              Change Password
            </button>
            <button
              type="button"
              onClick={() => handleLink("/dashboard?tab=settings")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <Settings className="h-4 w-4" />
              Settings
            </button>
            <div className="my-1 border-t border-white/10" />
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onLogout();
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-red-400 transition hover:bg-red-500/10 hover:text-red-300"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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

  const isActive = (href: string) => {
    if (pathname === href) return true;
    // Map custom mode pages to the AI Story Studio tab
    if (href === "/video" && ["/setup", "/story-builder", "/audio-generation", "/video-preview"].includes(pathname)) {
      return true;
    }
    return false;
  };

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

        <nav className="hidden items-center gap-3 md:flex">
          <div className="mr-4 flex items-center gap-2">
            {navLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  isActive(item.href)
                    ? "border-gold/30 bg-gold/10 text-gold"
                    : "border-white/10 text-white/80 hover:border-starlight/30 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

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
            <ProfileDropdown 
              userName={currentUser.name} 
              userEmail={currentUser.email} 
              onLogout={handleLogout} 
            />
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
                  isActive(item.href)
                    ? "border-gold/30 bg-gold/10 text-gold"
                    : "border-white/10 bg-white/5 text-white/80 hover:border-starlight/30 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            ))}

            {!loading && !currentUser ? (
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-4">
                <Link
                  href="/auth"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-[1.2rem] border border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-white/80 transition hover:border-starlight/30 hover:bg-white/10 hover:text-white"
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-[1.2rem] bg-gradient-to-r from-aurora to-gold px-4 py-3 text-center text-sm font-semibold text-slate-950 transition hover:scale-[1.01]"
                >
                  Sign Up
                </Link>
              </div>
            ) : null}

            {!loading && currentUser ? (
              <div className="mt-2 rounded-[1.2rem] border border-white/10 bg-white/5 p-4">
                <div className="mb-4 flex items-center gap-3 border-b border-white/10 pb-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-aurora to-gold text-base font-bold text-slate-950">
                    {(currentUser.name || currentUser.email || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="overflow-hidden">
                    <p className="truncate text-sm font-semibold text-white">{currentUser.name || "User"}</p>
                    <p className="truncate text-xs text-white/60">{currentUser.email}</p>
                  </div>
                </div>
                
                <div className="grid gap-1">
                  <Link
                    href="/dashboard"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
                  >
                    <User className="h-4 w-4" />
                    View Profile
                  </Link>
                  <Link
                    href="/reset-password"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
                  >
                    <Settings className="h-4 w-4" />
                    Change Password
                  </Link>
                  <Link
                    href="/dashboard?tab=settings"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                  <div className="my-1 border-t border-white/10" />
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-red-400 transition hover:bg-red-500/10 hover:text-red-300"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              </div>
            ) : null}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
