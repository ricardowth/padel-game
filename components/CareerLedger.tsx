"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import type { CareerState } from "../lib/data/types";
import { END_AGE, START_AGE } from "../lib/sim/career";
import type { World } from "../lib/sim/types";
import { euro } from "../lib/ui/format";
import { Flag, RatingPill } from "./ui/Pills";

/**
 * The career spine (§14): one row per age, anchored on the **partner** — padel
 * has no clubs, and the partner is what changes yearly and carries the drama.
 * Future ages stay greyed out to 35, and a `↳` marks a season with the same
 * partner as the year before (chemistry building).
 */
export function CareerLedger({
  state,
  world,
  pendingLabel,
}: {
  state: CareerState;
  world: World;
  pendingLabel: string | null;
}) {
  const t = useTranslations("board.ledger");
  const tSide = useTranslations("board.sideShort");

  const currentRowRef = useRef<HTMLTableRowElement>(null);
  const rowCount = state.history.length;

  // Keep the newest season in view as the ledger fills in live. Scrolling to
  // the container's full height would land on age 35 — twenty empty future
  // rows past anything that has happened yet.
  useEffect(() => {
    currentRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [rowCount]);

  const ages = Array.from({ length: END_AGE - START_AGE + 1 }, (_, i) => START_AGE + i);
  const nameOf = (id: string | null) => (id ? (world.players.get(id)?.name ?? "—") : "—");
  const countryOf = (id: string | null) => (id ? (world.players.get(id)?.country ?? "") : "");

  return (
    <section className="panel flex max-h-[60vh] min-h-0 flex-col lg:max-h-none">
      <header className="flex items-baseline justify-between border-b border-[color:var(--color-line-soft)] px-3 py-2">
        <h2 className="label">{t("title")}</h2>
        <span className="num text-[11px] text-[color:var(--color-faint)]">
          {state.year}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-[color:var(--color-surface)]">
            <tr className="text-left">
              {[t("age"), t("partner"), t("side"), t("ovr"), t("titles"), t("rank"), t("earnings")].map(
                (heading, i) => (
                  <th
                    key={heading}
                    className={`label px-2 py-1.5 font-semibold ${i >= 3 ? "text-right" : ""}`}
                  >
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {ages.map((age) => {
              const index = age - START_AGE;
              const row = state.history[index];
              const previous = index > 0 ? state.history[index - 1] : undefined;

              if (!row) {
                const isCurrent = index === state.history.length && pendingLabel;
                return (
                  <tr
                    key={age}
                    ref={isCurrent ? currentRowRef : undefined}
                    className="border-t border-[color:var(--color-line-soft)] text-[color:var(--color-faint)]"
                  >
                    <td className="num px-2 py-1.5">{age}</td>
                    <td className="px-2 py-1.5 italic" colSpan={6}>
                      {isCurrent ? pendingLabel : ""}
                    </td>
                  </tr>
                );
              }

              const continued = previous?.partnerId === row.partnerId;

              return (
                <tr
                  key={age}
                  ref={index === state.history.length - 1 ? currentRowRef : undefined}
                  className={`rise border-t border-[color:var(--color-line-soft)] hover:bg-white/[0.03] ${
                    index === state.history.length - 1
                      ? "bg-[color:var(--color-accent)]/[0.05]"
                      : ""
                  }`}
                >
                  <td className="num px-2 py-1.5 font-semibold">{age}</td>
                  <td className="max-w-0 px-2 py-1.5">
                    <span className="flex items-center gap-1">
                      <span className="w-3 shrink-0 text-[color:var(--color-faint)]">
                        {continued ? "↳" : ""}
                      </span>
                      {/* Seven columns is tight on a phone; the name matters
                          more than the country badge, so drop it first. */}
                      <Flag iso={countryOf(row.partnerId)} className="hidden sm:inline-flex" />
                      <span className="truncate">{nameOf(row.partnerId)}</span>
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-[color:var(--color-muted)]">
                    {tSide(row.side)}
                    {row.sidePenalised ? (
                      <span className="text-[color:var(--color-bad)]">*</span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <RatingPill value={row.ovr} />
                  </td>
                  <td className="num px-2 py-1.5 text-right font-bold">
                    {row.titles ? (
                      <span className="text-[color:var(--color-accent)]">{row.titles}</span>
                    ) : (
                      <span className="text-[color:var(--color-faint)]">—</span>
                    )}
                  </td>
                  <td className="num px-2 py-1.5 text-right text-[color:var(--color-muted)]">
                    {row.rank > 0 ? `#${row.rank}` : "—"}
                  </td>
                  <td
                    className={`num px-2 py-1.5 text-right ${
                      row.earnings < 0
                        ? "text-[color:var(--color-bad)]"
                        : "text-[color:var(--color-muted)]"
                    }`}
                  >
                    {euro(row.earnings)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* The reference's bottom national-team row becomes World Championship. */}
      <footer className="flex items-center justify-between border-t border-[color:var(--color-line-soft)] px-3 py-2 text-[11px]">
        <span className="flex items-center gap-1.5 text-[color:var(--color-muted)]">
          <span aria-hidden className="text-[13px] leading-none">🌍</span>
          {t("worlds", { country: state.worlds.country })}
        </span>
        <span className="num text-[color:var(--color-faint)]">
          {t("worldsRecord", { apps: state.worlds.apps, golds: state.worlds.golds })}
        </span>
      </footer>
    </section>
  );
}
