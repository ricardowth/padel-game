"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Link } from "../lib/i18n/navigation";
import {
  awardCounts,
  definingPartnerships,
  legacyTier,
  peakOvr,
  peakRank,
  type CareerEngine,
} from "../lib/sim/career";
import { euro } from "../lib/ui/format";
import { CareerLedger } from "./CareerLedger";
import { Flag, OvrBadge, SideTag } from "./ui/Pills";

/**
 * "CAREER COMPLETE" (§14) — a purpose-built shareable card, not the ledger.
 * The reference organises its end screen around defining *clubs*; ours is
 * organised around defining **partnerships**, biggest first.
 */
export function ResultCard({ engine }: { engine: CareerEngine }) {
  const t = useTranslations("result");
  const tBoard = useTranslations("board");
  const tAwards = useTranslations("awards");
  const locale = useLocale();

  const [showLedger, setShowLedger] = useState(false);
  /** null while idle; otherwise the footer button's transient state. */
  const [shareState, setShareState] = useState<"sharing" | "saved" | "copied" | null>(null);

  const { state, world } = engine;
  const tier = legacyTier(state);
  const peak = peakRank(state);
  const ovr = peakOvr(state);
  const partnerships = definingPartnerships(state);
  const awards = awardCounts(state);

  const nameOf = (id: string) => world.players.get(id)?.name ?? "—";
  const countryOf = (id: string) => world.players.get(id)?.country ?? "";

  /** Params the OG route needs to redraw this card as an image. */
  const ogPath = () => {
    const params = new URLSearchParams({
      name: state.you.name,
      tier,
      ovr: String(ovr),
      side: state.you.currentSide,
      country: state.you.country,
      titles: String(state.titles),
      finals: String(state.finals),
      weeks: String(state.weeksAtNo1),
      earnings: euro(state.earnings),
      peak: String(peak),
      locale,
    });
    return `/api/og?${params}`;
  };

  /** `luis-branco-contender-64.png` — a filename worth having in a camera roll. */
  const imageName = () => {
    const slug = state.you.name
      .normalize("NFD")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
    return `${slug || "padel"}-${tier}-${ovr}.png`;
  };

  /**
   * Share the card as an actual image, not a link.
   *
   * The OG route already draws the card, so this fetches that PNG and hands the
   * *file* to the share sheet — on phones that puts the picture straight into
   * Instagram or WhatsApp. Desktop browsers cannot share files, so there it
   * downloads instead; only if both fail does it fall back to copying a link.
   */
  const share = async () => {
    const text = t("shareText", {
      name: state.you.name,
      tier: t(`tier.${tier}`),
      titles: state.titles,
      peak,
      earnings: euro(state.earnings),
    });

    const flash = (value: "saved" | "copied") => {
      setShareState(value);
      setTimeout(() => setShareState(null), 2000);
    };

    setShareState("sharing");
    try {
      const response = await fetch(ogPath());
      if (!response.ok) throw new Error(`og ${response.status}`);
      const file = new File([await response.blob()], imageName(), { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: t("title"), text, files: [file] });
        setShareState(null);
        return;
      }

      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
      flash("saved");
    } catch (error) {
      // AbortError means the user dismissed the share sheet — not a failure.
      if (error instanceof DOMException && error.name === "AbortError") {
        setShareState(null);
        return;
      }
      try {
        await navigator.clipboard.writeText(`${text}\n${window.location.origin}${ogPath()}`);
        flash("copied");
      } catch {
        setShareState(null);
      }
    }
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6">
      <div className="rise panel overflow-hidden">
        {/* Identity block */}
        <header className="border-b border-[color:var(--color-line-soft)] p-5">
          <p className="label text-[color:var(--color-accent)]">{t("title")}</p>

          <div className="mt-3 flex items-start gap-4">
            <OvrBadge value={ovr} size="lg" label={t("peakOvr")} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Flag iso={state.you.country} className="text-[10px]" />
                <SideTag label={tBoard(`sideShort.${state.you.currentSide}`)} />
              </div>
              <h1 className="mt-1 text-2xl font-black leading-tight sm:text-3xl">
                {state.you.name}
              </h1>
              <p className="num mt-1 text-xs text-[color:var(--color-muted)]">
                {t("totals", {
                  titles: state.titles,
                  finals: state.finals,
                  weeks: state.weeksAtNo1,
                  earnings: euro(state.earnings),
                })}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-[color:var(--color-accent)]/30 bg-[color:var(--color-accent)]/[0.07] px-4 py-3">
            <p className="text-lg font-black uppercase tracking-wide text-[color:var(--color-accent)]">
              {t(`tier.${tier}`)}
            </p>
            <p className="mt-0.5 text-xs text-[color:var(--color-muted)]">
              {t(`tier.${tier}Blurb`)}
            </p>
            <p className="num mt-2 text-[11px] text-[color:var(--color-faint)]">
              {t("peakRank")} #{peak}
            </p>
          </div>
        </header>

        {/* World Championship + awards */}
        <div className="grid border-b border-[color:var(--color-line-soft)] sm:grid-cols-2">
          <section className="border-b border-[color:var(--color-line-soft)] p-4 sm:border-b-0 sm:border-r">
            <h2 className="label flex items-center gap-1.5">
              <span aria-hidden className="text-[13px] leading-none">🌍</span>
              {t("worlds")}
            </h2>
            {state.worlds.apps > 0 ? (
              <p className="mt-1.5 text-sm">
                <Flag iso={state.worlds.country} /> {state.worlds.apps} · {state.worlds.golds} 🥇
              </p>
            ) : (
              <p className="mt-1.5 text-xs uppercase tracking-wider text-[color:var(--color-faint)]">
                {t("worldsEmpty")}
              </p>
            )}
          </section>

          <section className="p-4">
            <h2 className="label flex items-center gap-1.5">
              <span aria-hidden className="text-[13px] leading-none">🏅</span>
              {t("awards")}
            </h2>
            {awards.size > 0 ? (
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {[...awards.entries()].map(([type, count]) => (
                  <li
                    key={type}
                    className="rounded border border-[color:var(--color-accent)]/30 bg-[color:var(--color-accent)]/10 px-2 py-0.5 text-[11px] font-semibold text-[color:var(--color-accent)]"
                  >
                    {tAwards(type)}
                    {count > 1 ? ` (×${count})` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-xs uppercase tracking-wider text-[color:var(--color-faint)]">
                {tAwards("empty")}
              </p>
            )}
          </section>
        </div>

        {/* Defining partnerships — the grid that replaces the reference's clubs */}
        <section className="p-4">
          <h2 className="label">{t("partnerships")}</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {partnerships.slice(0, 6).map((p, index) => (
              <li
                key={p.partnerId}
                className={`rounded-lg border border-[color:var(--color-line)] bg-white/[0.02] p-3 ${
                  index === 0 ? "sm:col-span-2 lg:col-span-1 lg:row-span-1" : ""
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Flag iso={countryOf(p.partnerId)} />
                  <span className="truncate text-sm font-bold">{nameOf(p.partnerId)}</span>
                </div>
                <p className="mt-1 text-[11px] text-[color:var(--color-muted)]">
                  {t("seasonsTogether", { count: p.seasonsTogether })}
                </p>
                <p className="num mt-0.5 text-[11px] text-[color:var(--color-faint)]">
                  {t("partnershipTotals", { titles: p.titles, finals: p.finals })}
                </p>
                {p.titles > 0 ? (
                  <p className="mt-1 text-sm leading-none" aria-hidden>
                    {"🏆".repeat(Math.min(5, p.titles))}
                  </p>
                ) : (
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-[color:var(--color-faint)]">
                    {tAwards("empty")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--color-line-soft)] p-4">
          <span className="num text-[11px] text-[color:var(--color-faint)]">
            {t("seed")}: {state.seed}
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowLedger((v) => !v)}
              className="rounded-lg border border-[color:var(--color-line)] px-4 py-2 text-xs font-semibold text-[color:var(--color-muted)] transition-colors hover:bg-white/[0.05]"
            >
              {t("viewLedger")}
            </button>
            <button
              type="button"
              onClick={share}
              disabled={shareState === "sharing"}
              className="rounded-lg border border-[color:var(--color-line)] px-4 py-2 text-xs font-semibold text-[color:var(--color-muted)] transition-colors hover:bg-white/[0.05] disabled:opacity-60"
            >
              {shareState ? t(shareState) : t("share")}
            </button>
            <Link
              href="/"
              className="rounded-lg bg-[color:var(--color-accent)] px-5 py-2 text-xs font-bold uppercase tracking-wider text-[color:var(--color-ink)] transition-transform hover:brightness-110 active:scale-[0.99]"
            >
              ↻ {t("playAgain")}
            </Link>
          </div>
        </footer>
      </div>

      {showLedger ? (
        <div className="mt-4 h-[28rem]">
          <CareerLedger state={state} world={world} pendingLabel={null} />
        </div>
      ) : null}
    </main>
  );
}
