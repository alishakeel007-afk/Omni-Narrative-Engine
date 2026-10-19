import Link from "next/link";
import { ArrowRight, BookOpen, MessageSquare } from "lucide-react";

export default function GuidePage() {
  return <main className="mx-auto max-w-3xl px-5 py-12">
    <BookOpen size={24} aria-hidden /><h1 className="mt-4 text-3xl font-semibold tracking-tight">One story. One decision at a time.</h1>
    <p className="mt-4 text-sm leading-7 text-[var(--muted)]">Start with a rough idea. Each of the four stages has small parts, with Back and Continue controls. Your answers save as you go, and the part menu lets you revisit a decision.</p>
    <ol className="mt-8 space-y-6">{[
      ["Setup", "Share your rough idea or existing script. Choose a title, visual feel, audience, mood and ending. Optional decisions can stay open."],
      ["Script & Characters", "Arrange the story, review one character at a time, then work through each scene’s action and dialogue. Upload or generate a reference, review it, and lock the character before generating their scenes."],
      ["Generate Video", "Create and review one scene at a time. Approve a scene image when needed, generate the video, and select a take. Once every scene is ready, assemble them."],
      ["Edit & Export", "Watch the story, trim and arrange clips, add optional text, adjust sound, and export a merged MP4. Your original takes stay preserved."],
    ].map(([title, copy], index) => <li key={title} className="flex gap-4"><span className="story-scene-index">{index + 1}</span><div><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm leading-7 text-[var(--muted)]">{copy}</p></div></li>)}</ol>
    <div className="mt-9 rounded-2xl border border-[var(--line)] p-5"><h2 className="flex items-center gap-2 font-semibold"><MessageSquare size={17} aria-hidden /> Ask Omni when you need it</h2><p className="mt-3 text-sm leading-7 text-[var(--muted)]">The Ask Omni control beside a decision uses your rough story, saved script and the selected scene or character. Add a specific request if you like. Suggestions are proposals: choose one to apply it, or keep writing your own. Image and video generation start only from their generation buttons.</p></div>
    <Link href="/dashboard?new=1" className="decision-next mt-8">Start a story <ArrowRight size={16} aria-hidden /></Link>
  </main>;
}
