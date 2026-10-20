"use client";

import { Select } from "@/components/ui/select";

import { useEffect, useState } from "react";
import { Plus, Trash2, Type } from "lucide-react";
import type { StudioTextOverlay, TimelineClip } from "@/types/studio";

/** Matches `textOverlaySchema` and the exporter's own Overlay model. */
const MAX_OVERLAYS = 8;
const MIN_SIZE = 16;
const MAX_SIZE = 96;
const HEX = /^#[0-9a-f]{6}$/i;

/** Captions are film content, so these are print colours, not UI theme. */
const PRESETS = [
  { label: "White", value: "#ffffff" },
  { label: "Black", value: "#000000" },
  { label: "Green", value: "#c1f17b" },
];

const POSITIONS = [
  { label: "Top", x: 0.5, y: 0.1 },
  { label: "Middle", x: 0.5, y: 0.5 },
  { label: "Lower third", x: 0.5, y: 0.78 },
  { label: "Bottom", x: 0.5, y: 0.92 },
];

type Props = {
  clip: TimelineClip;
  /** Length of this clip, which bounds every overlay's timing. */
  length: number;
  disabled?: boolean;
  onChange: (texts: StudioTextOverlay[]) => void;
};

/**
 * Text overlays for one clip.
 *
 * Timing is relative to THIS clip, which is what the exporter renders: each
 * clip is trimmed and its timestamps reset before `drawtext` runs. Splitting a
 * clip redistributes overlays by the time they cover, so the editor and the
 * exported file agree.
 */
export function OverlayEditor({ clip, length, disabled, onChange }: Props) {
  const texts = clip.texts ?? [];
  const [adding, setAdding] = useState(false);

  const update = (index: number, patch: Partial<StudioTextOverlay>) => {
    onChange(texts.map((text, position) => (position === index ? { ...text, ...patch } : text)));
  };

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-[var(--ink)]">
          Text ({texts.length}/{MAX_OVERLAYS})
        </span>
        <span className="text-xs text-[var(--muted)]">
          Timed from the start of this clip
        </span>
      </div>

      {texts.length ? (
        <ul className="mt-2 space-y-2">
          {texts.map((text, index) => (
            <li key={index} className="rounded-xl border border-[var(--line)] p-3">
              <div className="flex items-start gap-2">
                <OverlayText value={text.text} disabled={disabled} label={`Overlay ${index + 1} text`}
                  onCommit={value => update(index, { text: value })} />
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Delete overlay ${index + 1}`}
                  onClick={() => onChange(texts.filter((_, position) => position !== index))}
                  className="rounded-full border border-[var(--line)] p-1.5 text-[var(--ink)] transition hover:bg-black/[0.04] disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>

              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs text-[var(--muted)]">Position</span>
                  <Select aria-label={`Overlay ${index + 1} position`}
                    value={
                      POSITIONS.find(
                        (option) =>
                          Math.abs(option.x - text.x) < 0.01 && Math.abs(option.y - text.y) < 0.01,
                      )?.label ?? "custom"
                    }
                    disabled={disabled}
                    onChange={(event) => {
                      const option = POSITIONS.find((item) => item.label === event.target.value);
                      if (option) update(index, { x: option.x, y: option.y });
                    }}
                    className="mt-1 block w-full rounded-lg border border-[var(--line)] px-2 py-1.5 text-sm text-[var(--ink)] outline-none disabled:opacity-60"
                  >
                    {POSITIONS.map((option) => (
                      <option key={option.label} value={option.label}>
                        {option.label}
                      </option>
                    ))}
                    <option value="custom">Custom</option>
                  </Select>
                  <span className="mt-1 flex gap-2">
                    <NumberField
                      label="x"
                      value={text.x}
                      min={0}
                      max={1}
                      step={0.01}
                      disabled={disabled}
                      onChange={(value) => update(index, { x: value })}
                    />
                    <NumberField
                      label="y"
                      value={text.y}
                      min={0}
                      max={1}
                      step={0.01}
                      disabled={disabled}
                      onChange={(value) => update(index, { y: value })}
                    />
                  </span>
                </label>

                <label className="block">
                  <span className="text-xs text-[var(--muted)]">
                    Size ({text.size}px)
                  </span>
                  <input
                    type="range"
                    min={MIN_SIZE}
                    max={MAX_SIZE}
                    step={1}
                    value={text.size}
                    disabled={disabled}
                    onChange={(event) => update(index, { size: Number(event.target.value) })}
                    className="mt-1 block h-1.5 w-full accent-[var(--ink)]"
                  />
                  <span className="mt-2 block text-xs text-[var(--muted)]">Colour</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    {PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        disabled={disabled}
                        aria-label={preset.label}
                        data-color-swatch
                        aria-pressed={text.color.toLowerCase() === preset.value}
                        onClick={() => update(index, { color: preset.value })}
                        style={{ background: preset.value }}
                        className={`h-6 w-6 rounded-full border ${
                          text.color.toLowerCase() === preset.value
                            ? "border-[var(--ink)]"
                            : "border-[var(--line)]"
                        }`}
                      />
                    ))}
                    <input
                      value={text.color}
                      maxLength={7}
                      disabled={disabled}
                      aria-label="Overlay colour as hex"
                      onChange={(event) => {
                        const value = event.target.value;
                        // Only a complete, valid hex is committed; the server
                        // rejects anything else, so a half-typed value would
                        // otherwise fail the whole save.
                        if (HEX.test(value)) update(index, { color: value.toLowerCase() });
                      }}
                      className="w-24 rounded-lg border border-[var(--line)] px-2 py-1 font-mono text-xs text-[var(--ink)] outline-none focus:border-[var(--ink)] disabled:opacity-60"
                    />
                  </span>
                </label>
              </div>

              <div className="mt-2 flex flex-wrap items-end gap-3">
                <NumberField
                  label="Start"
                  suffix="s"
                  value={text.start}
                  min={0}
                  max={Math.max(0, length)}
                  step={0.1}
                  disabled={disabled}
                  onChange={(value) => update(index, { start: value })}
                />
                <NumberField
                  label="End"
                  suffix="s"
                  value={text.end}
                  min={0}
                  max={Math.max(0, length)}
                  step={0.1}
                  disabled={disabled}
                  onChange={(value) => update(index, { end: value })}
                />
                <span className="text-xs leading-5 text-[var(--muted)]">
                  {text.end
                    ? text.end <= text.start
                      ? "End has to follow start."
                      : `Shows ${text.start.toFixed(1)}s–${text.end.toFixed(1)}s`
                    : `Shows from ${text.start.toFixed(1)}s to the end of the clip`}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? null : (
        <button
          type="button"
          disabled={disabled || texts.length >= MAX_OVERLAYS}
          onClick={() => {
            setAdding(true);
            onChange([
              ...texts,
              {
                text: "New text",
                x: 0.5,
                y: 0.78,
                size: 36,
                color: "#ffffff",
                start: 0,
                // 0 means "to the end of this clip", the exporter's convention.
                end: 0,
              },
            ]);
            setAdding(false);
          }}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:bg-black/[0.04] disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          <Type className="h-3.5 w-3.5" aria-hidden />
          Add text
        </button>
      )}
    </div>
  );
}

function OverlayText({ value, disabled, label, onCommit }: {
  value: string; disabled?: boolean; label: string; onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return <textarea value={draft} maxLength={500} rows={2} disabled={disabled} aria-label={label}
    onChange={event => setDraft(event.target.value)} onBlur={() => { if (draft !== value) onCommit(draft); }}
    className="flex-1 rounded-lg border border-[var(--line)] px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none focus:border-[var(--ink)] disabled:opacity-60" />;
}

function NumberField({
  label,
  suffix,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  suffix?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-xs text-[var(--muted)]">
      {label}
      {suffix ? ` (${suffix})` : ""}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next))
            onChange(Math.min(Math.max(next, min), max));
        }}
        className="mt-0.5 block w-20 rounded-lg border border-[var(--line)] px-2 py-1 text-xs text-[var(--ink)] outline-none focus:border-[var(--ink)] disabled:opacity-60"
      />
    </label>
  );
}
