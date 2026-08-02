"use client";

import { useTranslations } from "next-intl";

import type { SeasonOutcome } from "../lib/sim/types";
import { euro } from "../lib/ui/format";

const TONE_CLASS = {
  good: "text-[color:var(--color-good)]",
  bad: "text-[color:var(--color-bad)]",
  neutral: "text-[color:var(--color-muted)]",
} as const;

/**
 * What just happened, in at most three lines.
 *
 * Without this the season is a silent gap between two decisions: the ledger
 * gains a row and the player is handed the next card. Naming the title they
 * won, the top-ten they cracked or the rival who passed them is what turns a
 * simulated year into one worth having played.
 */
export function SeasonRecap({ season }: { season: SeasonOutcome }) {
  const t = useTranslations();
  const tSeason = useTranslations("season");

  return (
    <section className="rise panel p-4">
      <header className="flex items-baseline justify-between">
        <h2 className="label">{tSeason("recap", { year: season.year })}</h2>
        <span className="num text-[11px] text-[color:var(--color-faint)]">
          {season.rank > 0 ? `#${season.rank}` : "—"} ·{" "}
          <span className={season.earnings < 0 ? "text-[color:var(--color-bad)]" : ""}>
            {euro(season.earnings)}
          </span>
        </span>
      </header>

      <ul className="mt-2 flex flex-col gap-1">
        {season.highlights.map((highlight, i) => (
          <li
            key={`${highlight.key}-${i}`}
            className={`flex gap-2 text-xs leading-snug ${TONE_CLASS[highlight.tone]}`}
          >
            <span aria-hidden className="select-none opacity-50">
              ›
            </span>
            <span>{t(highlight.key, highlight.values ?? {})}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
