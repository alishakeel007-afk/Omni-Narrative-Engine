"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCcw, Home, Download } from "lucide-react";
import ScreenLayout from "@/screens/ScreenLayout";
import type { GameOverState, GameOverReason } from "@/lib/game-over";

const GAME_OVER_MESSAGES: Record<GameOverReason, { title: string; emoji: string; description: string }> = {
  DEATH: {
    title: "You Have Fallen",
    emoji: "💀",
    description: "Your journey ends here. The darkness claims you."
  },
  DESPAIR: {
    title: "Broken by Despair",
    emoji: "😔",
    description: "Your resolve has shattered. You can continue no longer."
  },
  EXHAUSTION: {
    title: "Utterly Exhausted",
    emoji: "😫",
    description: "You collapse from exhaustion. The story ends."
  },
  MADNESS: {
    title: "Lost to Madness",
    emoji: "🌀",
    description: "Your mind slips away. Reality becomes meaningless."
  },
  TIME_LIMIT: {
    title: "Time's Up",
    emoji: "⏰",
    description: "The clock has stopped. Your time is over."
  },
  PLAYER_QUIT: {
    title: "Story Ended",
    emoji: "🛑",
    description: "You chose to end your journey here."
  }
};

interface GameOverScreenProps {
  gameOverState: GameOverState;
  onRestart: () => void;
  onLoadPrevious?: () => void;
  onExport?: () => void;
}

export default function GameOverScreen({
  gameOverState,
  onRestart,
  onLoadPrevious,
  onExport
}: GameOverScreenProps) {
  const router = useRouter();
  const messageData = GAME_OVER_MESSAGES[gameOverState.reason];

  return (
    <ScreenLayout
      eyebrow="Story Complete"
      title={messageData.title}
      description={messageData.description}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-8">
        {/* Main Game Over Message */}
        <div className="glass-panel rounded-[2rem] p-8 text-center">
          <div className="mb-6 text-8xl">{messageData.emoji}</div>
          <h1 className="text-4xl font-[var(--font-heading)] text-white">
            {messageData.title}
          </h1>
          <p className="mt-4 text-xl text-white/80">
            {gameOverState.message}
          </p>
        </div>

        {/* Story Stats */}
        <div className="glass-panel rounded-[1.5rem] p-6">
          <h2 className="text-lg font-semibold text-gold mb-4 uppercase tracking-wider">
            Run Statistics
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatBox
              label="Scenes Completed"
              value={gameOverState.finalStats.scenesCompleted}
            />
            <StatBox
              label="Choices Made"
              value={gameOverState.finalStats.choicesMade}
            />
            <StatBox
              label="Items Collected"
              value={gameOverState.finalStats.itemsCollected}
            />
            <StatBox
              label="Time Elapsed"
              value={formatTime(gameOverState.finalStats.timeElapsed)}
            />
          </div>
        </div>

        {/* Game Over Reason */}
        <div className="glass-panel rounded-[1.5rem] p-6 border border-red-500/20 bg-red-500/5">
          <h3 className="text-sm uppercase tracking-wider text-red-400 mb-3">
            How Your Story Ended
          </h3>
          <p className="text-white/90 leading-relaxed">
            {getExtendedGameOverMessage(gameOverState.reason)}
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {gameOverState.canRestart && (
            <button
              onClick={onRestart}
              className="w-full flex items-center justify-center gap-3 rounded-lg bg-gradient-to-r from-aurora via-starlight to-gold px-6 py-3 font-semibold text-slate-950 transition hover:shadow-lg hover:shadow-gold/20"
            >
              <RotateCcw className="h-5 w-5" />
              Restart Story
            </button>
          )}

          {gameOverState.canLoadPrevious && onLoadPrevious && (
            <button
              onClick={onLoadPrevious}
              className="w-full flex items-center justify-center gap-3 rounded-lg border border-white/20 bg-white/5 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
            >
              Load Previous Save
            </button>
          )}

          {onExport && (
            <button
              onClick={onExport}
              className="w-full flex items-center justify-center gap-3 rounded-lg border border-starlight/30 bg-starlight/10 px-6 py-3 font-semibold text-starlight transition hover:bg-starlight/15"
            >
              <Download className="h-5 w-5" />
              Export Story
            </button>
          )}

          <Link
            href="/dashboard"
            className="flex items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/5 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
          >
            <Home className="h-5 w-5" />
            Back to Dashboard
          </Link>
        </div>

        {/* Encouragement */}
        <div className="rounded-lg bg-white/5 p-4 text-center">
          <p className="text-sm text-white/70">
            Every ending is a beginning in disguise. <br />
            Would you like to start a new adventure?
          </p>
        </div>
      </div>
    </ScreenLayout>
  );
}

/**
 * Stat box component for displaying metrics
 */
function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-white/5 p-3 text-center">
      <p className="text-2xl font-bold text-gold">{value}</p>
      <p className="mt-1 text-xs uppercase text-white/60">{label}</p>
    </div>
  );
}

/**
 * Format time in milliseconds to readable format
 */
function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Get extended message for each game over reason
 */
function getExtendedGameOverMessage(reason: GameOverReason): string {
  const messages: Record<GameOverReason, string> = {
    DEATH: "You fought valiantly, but your wounds were too severe. Your journey has come to an end, but the story you lived will be remembered.",
    DESPAIR:
      "The weight of your choices became too much to bear. Your spirit broke, and you could no longer find the strength to continue forward.",
    EXHAUSTION:
      "The trials you faced drained you completely. Both body and mind surrendered, and you fell into an eternal sleep.",
    MADNESS:
      "The horrors you witnessed twisted your mind beyond recognition. Reality itself became a stranger, and you lost yourself to chaos.",
    TIME_LIMIT:
      "Time itself became your enemy. The hourglass ran out, and the world moved on without you.",
    PLAYER_QUIT:
      "You made the choice to step away from this world. Perhaps another day, another story awaits you."
  };

  return messages[reason];
}
