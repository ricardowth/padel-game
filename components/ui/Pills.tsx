"use client";

import { ratingTone, flagEmoji, meterPercent } from "../../lib/ui/format";

/** The big colour-coded OVR badge from the reference identity card (§14). */
export function OvrBadge({
  value,
  size = "md",
  label,
}: {
  value: number;
  size?: "sm" | "md" | "lg";
  label?: string;
}) {
  const dims = {
    sm: "h-9 w-9 text-sm",
    md: "h-16 w-16 text-2xl",
    lg: "h-24 w-24 text-4xl",
  }[size];

  return (
    <div
      className={`num flex ${dims} shrink-0 flex-col items-center justify-center rounded-xl font-black leading-none text-white`}
      style={{ background: ratingTone(value) }}
    >
      {value}
      {label ? (
        <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider opacity-80">
          {label}
        </span>
      ) : null}
    </div>
  );
}

/** Small rating pill — ledger OVR cells and attribute rows. */
export function RatingPill({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span
      className={`num inline-flex min-w-[2.25rem] items-center justify-center rounded px-1.5 py-0.5 text-xs font-bold text-white ${className}`}
      style={{ background: ratingTone(value) }}
    >
      {value}
    </span>
  );
}

/**
 * Country marker.
 *
 * Deliberately *not* a flag emoji: Windows ships no colour flag font, so
 * `🇦🇷` degrades to the bare letters "AR" on every Windows browser — which is
 * most of the audience. A styled code badge renders identically everywhere and
 * stays legible at ledger size.
 */
export function Flag({ iso, className = "" }: { iso: string; className?: string }) {
  const code = (iso ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    return (
      <span aria-hidden className={`text-[color:var(--color-faint)] ${className}`}>
        ··
      </span>
    );
  }

  // Decorative: the country name or the player's name always sits next to it,
  // so announcing the code again would just be noise.
  return (
    <span
      aria-hidden
      className={`num inline-flex shrink-0 items-center justify-center rounded-[3px] border border-[color:var(--color-line)] bg-white/[0.06] px-1 text-[9px] font-bold leading-[1.35] tracking-wide text-[color:var(--color-muted)] ${className}`}
    >
      {code}
    </span>
  );
}

/** The `DRIVE` / `REVÉS` tag that replaces the reference's shirt number. */
export function SideTag({ label, penalised }: { label: string; penalised?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-[color:var(--color-line)] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[color:var(--color-muted)]">
      {label}
      {penalised ? <span className="text-[color:var(--color-bad)]">*</span> : null}
    </span>
  );
}

/** A 0..100 bar for chemistry / form / fatigue / morale. */
export function Meter({
  label,
  value,
  min = 0,
  max = 100,
  tone = "var(--color-accent)",
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  tone?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="label">{label}</span>
        <span className="num text-[11px] text-[color:var(--color-muted)]">{Math.round(value)}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${meterPercent(value, min, max)}%`, background: tone }}
        />
      </div>
    </div>
  );
}

/** A career-total figure in the identity card's `TITLES · FINALS · WEEKS #1` row. */
export function StatCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <div className="num text-lg font-bold leading-none">{value}</div>
      <div className="label mt-1">{label}</div>
    </div>
  );
}
