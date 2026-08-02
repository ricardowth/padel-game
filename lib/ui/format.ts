/**
 * Presentation helpers shared by every screen. Nothing here produces
 * user-facing *words* — those all come from the message catalog (§14). This is
 * only about numbers, colours and shapes.
 */
import type { Band, Side } from "../data/types";

/** Rating ramp used by OVR badges, attribute pills and ledger cells alike. */
export function ratingTone(value: number): string {
  if (value >= 88) return "var(--color-r6)";
  if (value >= 80) return "var(--color-r5)";
  if (value >= 72) return "var(--color-r4)";
  if (value >= 63) return "var(--color-r3)";
  if (value >= 52) return "var(--color-r2)";
  return "var(--color-r1)";
}

/**
 * Compact money, e.g. €1.2M / €740k / €900 / -€4.2k.
 *
 * Seasons can finish in the red once travel is charged, so the sign has to lead
 * rather than land between the symbol and the digits ("€-4171").
 */
export function euro(value: number): string {
  const sign = value < 0 ? "-" : "";
  const n = Math.abs(value);

  if (n >= 1_000_000) return `${sign}€${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${sign}€${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${sign}€${(n / 1000).toFixed(1)}k`;
  return `${sign}€${Math.round(n)}`;
}

/** Regional-indicator flag emoji from an ISO alpha-2 code. */
export function flagEmoji(iso: string): string {
  const code = (iso ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🏳️";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Localised country name, falling back to the raw code. */
export function countryName(iso: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(iso.toUpperCase()) ?? iso;
  } catch {
    return iso;
  }
}

/** Every ISO alpha-2 country that has a name in the given locale. */
export function allCountries(locale: string): { code: string; name: string }[] {
  const names = new Intl.DisplayNames([locale], { type: "region" });
  const out: { code: string; name: string }[] = [];

  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      let label: string | undefined;
      try {
        label = names.of(code);
      } catch {
        continue;
      }
      if (!label || label === code) continue;
      out.push({ code, name: label });
    }
  }

  return out.sort((x, y) => x.name.localeCompare(y.name, locale));
}

export const sideKey = (side: Side): "drive" | "reves" => side;

export const bandKey = (band: Band): Band => band;

/** Tailwind class for a consequence-tag tone (§10's green / red / grey). */
export const TAG_TONE_CLASS: Record<"good" | "bad" | "neutral", string> = {
  good: "border-[color:var(--color-good)]/35 bg-[color:var(--color-good)]/10 text-[color:var(--color-good)]",
  bad: "border-[color:var(--color-bad)]/35 bg-[color:var(--color-bad)]/10 text-[color:var(--color-bad)]",
  neutral: "border-[color:var(--color-line)] bg-white/[0.03] text-[color:var(--color-neutral)]",
};

/** 0..100 meters (chemistry, form, fatigue, morale). */
export function meterPercent(value: number, min = 0, max = 100): number {
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}
