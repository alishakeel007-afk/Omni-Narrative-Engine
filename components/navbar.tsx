"use client";

import Link from "next/link";
import type { Route } from "next";
import { ChevronDown, LogOut, Menu, Settings, Clapperboard, User, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
// The four-step workflow is the only authenticated creation journey, so the
// nav is just the project list plus a way to start one.
const navLinks: { href: Route; label: string }[] = [
  { href: "/dashboard" as Route, label: "My stories" },
  { href: "/dashboard?new=1" as Route, label: "New story" },
  { href: "/guide" as Route, label: "How it works" },
];
import { PublicBrand } from "@/components/public/public-shell";

function ProfileDropdown({
  userName,
  userEmail,
  onLogout,
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
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
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
        className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-transparent p-1 pr-3 transition hover:border-[var(--line)] hover:bg-transparent"
        aria-label="Open profile menu"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-bold text-[var(--ink)]">
          {initials}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-[var(--muted)] transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div role="menu" aria-label="Profile menu" className="absolute right-0 mt-2 w-56 origin-top-right rounded-2xl border border-[var(--line)] bg-white p-2 shadow-2xl backdrop-blur-xl">
          <div className="mb-2 border-b border-[var(--line)] px-3 pb-3 pt-2">
            <p className="truncate text-sm font-semibold text-[var(--ink)]">
              {userName || "User"}
            </p>
            <p className="truncate text-xs text-[var(--muted)]">{userEmail}</p>
          </div>

          <div className="flex flex-col gap-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => handleLink("/account?tab=profile")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--muted)] transition hover:bg-[var(--accent)] hover:text-[var(--ink)]"
            >
              <User className="h-4 w-4" />
              View Profile
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => handleLink("/account?tab=security")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--muted)] transition hover:bg-[var(--accent)] hover:text-[var(--ink)]"
            >
              <Settings className="h-4 w-4" />
              Change Password
            </button>
            <div className="my-1 border-t border-[var(--line)]" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                onLogout();
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--ink)] transition hover:bg-transparent hover:font-medium text-[var(--ink)]"
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
  const hiddenHeaderPaths = [
    "/",
    "/auth",
    "/signup",
    "/studio",
    "/try",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
  ];

  if (hiddenHeaderPaths.includes(pathname)) {
    return null;
  }

  const handleLogout = async () => {
    await logout();
    router.push("/auth");
    setMenuOpen(false);
  };


  // A film page belongs to the project list it was opened from.
  const isActive = (href: string) =>
    (href.includes("?") ? false : pathname === href || (href === "/dashboard" && (pathname.startsWith("/story/") || pathname.startsWith("/film/"))));

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-white/92 backdrop-blur-2xl shadow-card">
      <div className="mx-auto flex max-w-7xl items-center justify-between h-14 px-4 sm:px-6 lg:px-8">
        <PublicBrand />

        <nav className="hidden items-center gap-3 md:flex">
          <div className="mr-4 flex items-center gap-2">
            {navLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  isActive(item.href)
                    ? "border-[var(--accent)] bg-transparent text-[var(--ink)] hover:bg-[var(--accent)]"
                    : "border-[var(--line)] bg-white text-[var(--muted)] hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--ink)]"
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
                className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm text-[var(--muted)] transition hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--ink)]"
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--ink)] transition hover:opacity-90"
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
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--line)] bg-white text-[var(--ink)] transition hover:border-[var(--line)] md:hidden"
          aria-label="Toggle navigation menu"
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {menuOpen ? (
        <div className="border-t border-[var(--line)] px-4 pb-4 md:hidden">
          <nav aria-label="Primary navigation" className="mx-auto mt-4 grid max-w-7xl gap-2">
            {navLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={`rounded-[1.2rem] border px-4 py-3 text-sm transition ${
                  isActive(item.href)
                    ? "border-[var(--accent)] bg-transparent text-[var(--ink)] hover:bg-[var(--accent)]"
                    : "border-[var(--line)] bg-transparent text-[var(--muted)] hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--ink)]"
                }`}
              >
                {item.label}
              </Link>
            ))}

            {!loading && !currentUser ? (
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-[var(--line)] pt-4">
                <Link
                  href="/auth"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-[1.2rem] border border-[var(--line)] bg-transparent px-4 py-3 text-center text-sm text-[var(--muted)] transition hover:border-[var(--line)] hover:bg-black/[0.04] hover:text-[var(--ink)]"
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-[1.2rem] bg-[var(--accent)] px-4 py-3 text-center text-sm font-semibold text-[var(--ink)] transition hover:opacity-90"
                >
                  Sign Up
                </Link>
              </div>
            ) : null}

            {!loading && currentUser ? (
              <div className="mt-2 rounded-[1.2rem] border border-[var(--line)] bg-transparent p-4">
                <div className="mb-4 flex items-center gap-3 border-b border-[var(--line)] pb-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-base font-bold text-[var(--ink)]">
                    {(currentUser.name || currentUser.email || "?")
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <div className="overflow-hidden">
                    <p className="truncate text-sm font-semibold text-[var(--ink)]">
                      {currentUser.name || "User"}
                    </p>
                    <p className="truncate text-xs text-[var(--muted)]">
                      {currentUser.email}
                    </p>
                  </div>
                </div>

                <div className="grid gap-1">
                  <Link
                    href="/account?tab=profile"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--muted)] transition hover:bg-[var(--accent)] hover:text-[var(--ink)]"
                  >
                    <User className="h-4 w-4" />
                    View Profile
                  </Link>
                  <Link
                    href="/account?tab=security"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--muted)] transition hover:bg-[var(--accent)] hover:text-[var(--ink)]"
                  >
                    <Settings className="h-4 w-4" />
                    Change Password
                  </Link>
                  <div className="my-1 border-t border-[var(--line)]" />
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[var(--ink)] transition hover:bg-transparent hover:font-medium text-[var(--ink)]"
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
