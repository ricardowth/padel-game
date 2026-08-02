"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { ROUND_LADDER } from "../lib/data/points";
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
 * appeared. Streaming each result in — slowly for the ones that matter, quickly
 * for the filler — turns the longest dead moment in the loop into the one worth
 * watching. The running tally in the header is what makes it a scoreboard
 * rather than a log.
 */
export function SeasonFeed({
  results,
  total,
  year,
  onSkip,
}: {
  results: TournamentOutcome[];
  /** How many events the season holds, so the rail can fill. */
  total: number;
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

  const titles = results.filter((r) => r.won).length;
  const points = results.reduce((sum, r) => sum + r.points, 0);
  const net = results.reduce((sum, r) => sum + r.prize - r.cost, 0);
  const progress = total > 0 ? (results.length / total) * 100 : 0;

  return (
    <section className="rise panel flex max-h-80 flex-col p-4">
      <header className="shrink-0">
        <div className="flex items-baseline justify-between">
          <h2 className="label">{t("playing", { year })}</h2>
          <button
            type="button"
            onClick={onSkip}
            className="rounded px-2 py-0.5 text-[11px] font-semibold text-[color:var(--color-faint)] transition-colors hover:bg-white/[0.06] hover:text-[color:var(--color-text)]"
          >
            {t("skip")}
          </button>
        </div>

        {/* Running tally — the reason to keep watching. */}
        <div className="num mt-1.5 flex items-center gap-3 text-[11px]">
          <span
            className={
              titles > 0 ? "font-bold text-[color:var(--color-accent)]" : "text-[color:var(--color-faint)]"
            }
          >
            {titles} {t("titlesSoFar")}
          </span>
          <span className="text-[color:var(--color-faint)]">+{points}</span>
          <span
            className={
              net < 0 ? "text-[color:var(--color-bad)]" : "text-[color:var(--color-faint)]"
            }
          >
            {euro(net)}
          </span>
        </div>

        <div className="rail mt-2">
          <div
            className="h-full rounded-full bg-[color:var(--color-accent)]/70 transition-[width] duration-200"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
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
              // Titles get a tinted row and a flare. The feed slows down for
              // them, so they need to look like the reason it slowed down.
              className={`flex items-center gap-2 border-b border-[color:var(--color-line-soft)] py-1.5 last:border-0 ${
                won
                  ? "flare -mx-2 rounded-lg border-transparent bg-[color:var(--color-accent)]/[0.1] px-2"
                  : "rise"
              }`}
            >
              <span
                aria-hidden
                className="h-3 w-0.5 shrink-0 rounded-full"
                style={{ background: CATEGORY_TONE[r.category] ?? "var(--color-line)" }}
              />
              <span
                className={`min-w-0 flex-1 truncate text-xs ${won ? "font-bold" : ""}`}
              >
                {r.tournamentName}
              </span>

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

              <span className="num w-12 shrink-0 text-right text-[11px] text-[color:var(--color-faint)]">
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
