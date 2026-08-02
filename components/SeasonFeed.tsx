"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { ROUND_LADDER, WINNER_ROUND_INDEX } from "../lib/data/points";
import type { TournamentOutcome } from "../lib/sim/types";
import { euro } from "../lib/ui/format";

/** Accent per circuit level, so a Major reads differently from a Bronze. */
const CATEGORY_TONE: Record<string, string> = {
  major: "var(--color-accent)",
  finals: "var(--color-accent)",
  p1: "var(--color-r6)",
  p2: "var(--color-r5)",
  platinum: "var(--color-r4)",
  gold: "var(--color-r3)",
  silver: "var(--color-r1)",
  bronze: "var(--color-r2)",
};

/**
 * The season as it happens.
 *
 * A season used to be a silent jump: the ledger gained a row and the next card
 * appeared. Streaming each result in — with the title runs landing one at a time
 * — turns the longest dead moment in the loop into the one worth watching.
 */
export function SeasonFeed({
  results,
  year,
  onSkip,
}: {
  results: TournamentOutcome[];
  year: number;
  onSkip: () => void;
}) {
  const t = useTranslations("feed");
  const tCat = useTranslations("categories");
  const tRound = useTranslations("rounds");

  const endRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [results.length]);

  return (
    <section className="rise panel flex max-h-72 flex-col p-4">
      <header className="flex shrink-0 items-baseline justify-between">
        <h2 className="label">{t("playing", { year })}</h2>
        <button
          type="button"
          onClick={onSkip}
          className="rounded px-2 py-0.5 text-[11px] font-semibold text-[color:var(--color-faint)] transition-colors hover:bg-white/[0.06] hover:text-[color:var(--color-text)]"
        >
          {t("skip")}
        </button>
      </header>

      <ul className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
        {results.map((r, i) => {
          const won = r.won;
          const missed = !r.qualified;
          const round = ROUND_LADDER[r.roundReached] ?? "r32";

          return (
            <li
              key={`${r.tournamentId}-${i}`}
              ref={i === results.length - 1 ? endRef : undefined}
              // Titles get a tinted row. The feed slows down for them, so they
              // need to look like the reason it slowed down.
              className={`rise flex items-center gap-2 border-b border-[color:var(--color-line-soft)] py-1.5 last:border-0 ${
                won ? "-mx-2 rounded bg-[color:var(--color-accent)]/[0.09] px-2" : ""
              }`}
            >
              <span
                aria-hidden
                className="h-3 w-0.5 shrink-0 rounded-full"
                style={{ background: CATEGORY_TONE[r.category] ?? "var(--color-line)" }}
              />
              <span className="min-w-0 flex-1 truncate text-xs">{r.tournamentName}</span>

              <span className="label shrink-0 !text-[9px]">{tCat(r.category)}</span>

              <span
                className={`num shrink-0 text-[11px] font-bold ${
                  won
                    ? "text-[color:var(--color-accent)]"
                    : missed
                      ? "text-[color:var(--color-bad)]"
                      : "text-[color:var(--color-muted)]"
                }`}
              >
                {won ? t("won") : missed ? t("qualifyingExit") : tRound(round)}
              </span>

              <span className="num w-14 shrink-0 text-right text-[11px] text-[color:var(--color-faint)]">
                {r.points > 0 ? `+${r.points}` : "—"}
              </span>
              <span
                className={`num w-14 shrink-0 text-right text-[11px] ${
                  r.prize - r.cost < 0
                    ? "text-[color:var(--color-bad)]"
                    : "text-[color:var(--color-faint)]"
                }`}
              >
                {euro(r.prize - r.cost)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export { WINNER_ROUND_INDEX };
