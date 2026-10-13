"use client";

import Link from "next/link";
import { BookOpen, Inbox, History, Zap } from "lucide-react";

type EmptyStateType = "memory" | "inventory" | "history" | "stories" | "generic";

interface EmptyStateProps {
  type: EmptyStateType;
  title?: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  icon?: React.ReactNode;
}

const EMPTY_STATE_CONFIG: Record<EmptyStateType, {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
}> = {
  memory: {
    icon: <BookOpen className="h-12 w-12 text-starlight/50" />,
    title: "No Story Memory Yet",
    description: "As you progress through your story, important events and decisions will be recorded here.",
    actionLabel: "Start Playing",
    actionHref: "/story/play"
  },
  inventory: {
    icon: <Inbox className="h-12 w-12 text-starlight/50" />,
    title: "Your Inventory is Empty",
    description: "Items you collect during your adventure will appear here. Defeat enemies, explore locations, and find treasure!",
    actionLabel: "Continue Story",
    actionHref: "/story/play"
  },
  history: {
    icon: <History className="h-12 w-12 text-starlight/50" />,
    title: "No Story History Yet",
    description: "Once you complete stories or save your progress, they will appear in your history.",
    actionLabel: "Start New Story",
    actionHref: "/setup"
  },
  stories: {
    icon: <Zap className="h-12 w-12 text-starlight/50" />,
    title: "No Stories Found",
    description: "You haven't started any stories yet. Create your first adventure now!",
    actionLabel: "Create Story",
    actionHref: "/setup"
  },
  generic: {
    icon: <BookOpen className="h-12 w-12 text-starlight/50" />,
    title: "Nothing Here Yet",
    description: "There's nothing to display right now.",
    actionLabel: "Go Back",
    actionHref: "/"
  }
};

/**
 * Reusable Empty State Component
 */
export function EmptyState({
  type = "generic",
  title,
  description,
  actionLabel,
  actionHref,
  icon
}: EmptyStateProps) {
  const config = EMPTY_STATE_CONFIG[type];

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-8 text-center sm:p-12">
      <div className="mb-4 flex justify-center">
        {icon || config.icon}
      </div>
      <h3 className="text-xl font-semibold text-white">
        {title || config.title}
      </h3>
      <p className="mt-2 text-white/70">
        {description || config.description}
      </p>
      {(actionLabel || actionHref) && (
        <Link
          href={actionHref || config.actionHref}
          className="mt-6 inline-flex rounded-lg bg-gradient-to-r from-aurora via-starlight to-gold px-6 py-2 font-semibold text-slate-950 transition hover:shadow-lg hover:shadow-gold/20"
        >
          {actionLabel || config.actionLabel}
        </Link>
      )}
    </div>
  );
}

/**
 * Empty memory state
 */
export function EmptyMemoryState() {
  return <EmptyState type="memory" />;
}

/**
 * Empty inventory state
 */
export function EmptyInventoryState() {
  return <EmptyState type="inventory" />;
}

/**
 * Empty history state
 */
export function EmptyHistoryState() {
  return <EmptyState type="history" />;
}

/**
 * Empty stories state
 */
export function EmptyStoriesState() {
  return <EmptyState type="stories" />;
}
