"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { PublicAccountShell } from "@/components/public/public-shell";

const ACCOUNT_ROUTES = [
  "/auth",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];

/**
 * Page chrome for the account screens, and the one generic page left over
 * (not-found). The story-engine screens that used the generic branch are gone,
 * so it is kept deliberately plain and on-palette rather than carrying the old
 * theme's colours.
 */
export default function ScreenLayout({
  eyebrow,
  title,
  description,
  children,
  maxWidth = "max-w-4xl",
}: {
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  const pathname = usePathname();
  if (ACCOUNT_ROUTES.includes(pathname))
    return <PublicAccountShell title={title}>{children}</PublicAccountShell>;
  return (
    <section className="px-4 py-16 sm:px-6 lg:px-8">
      <div className={`mx-auto ${maxWidth}`}>
        {eyebrow || title || description ? (
          <div className="mb-10">
            {eyebrow ? (
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                {eyebrow}
              </p>
            ) : null}
            {title ? (
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--ink)]">
                {title}
              </h1>
            ) : null}
            {description ? (
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                {description}
              </p>
            ) : null}
          </div>
        ) : null}
        {children}
      </div>
    </section>
  );
}
