"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Link } from "../lib/i18n/navigation";
import { legacyTier, peakOvr, peakRank, type CareerEngine } from "../lib/sim/career";
import { awardCase, careerPath, trophyCase } from "../lib/sim/trophies";
import { euro } from "../lib/ui/format";
import { CareerLedger } from "./CareerLedger";
import { Flag, OvrBadge } from "./ui/Pills";

/** Trophy glyph per circuit level — bigger silverware for a bigger stage. */
const TROPHY_GLYPH: Record<string, string> = {
  major: "🏆",
  finals: "🏆",
  p1: "🥇",
  p2: "🥈",
  platinum: "🥉",
  gold: "🏅",
  silver: "🎖️",
  bronze: "🏵️",
};

const AWARD_GLYPH: Record<string, string> = {
  fip_no1: "👑",
  best_smash: "💥",
  breakout: "⭐",
};

/**
 * "CAREER COMPLETE" (§14) — the shareable hero, not the ledger.
 *
 * Laid out like the football card it is modelled on: an identity strip of
 * capsules, then **PATH** and **TROPHIES**. That card's path is the run of
 * clubs a player passed through; padel has no clubs, so ours is the run of
 * **partners** — the thing that actually changes and carries the drama.
 */
export function ResultCard({ engine }: { engine: CareerEngine }) {
  const t = useTranslations("result");
  const tBoard = useTranslations("board");
  const tAwards = useTranslations("awards");
  const tCat = useTranslations("categories");
  const locale = useLocale();

  const [showLedger, setShowLedger] = useState(false);
  /** null while idle; otherwise the footer button's transient state. */
  const [shareState, setShareState] = useState<"sharing" | "saved" | "copied" | null>(null);

  const { state, world } = engine;
  const tier = legacyTier(state);
  const peak = peakRank(state);
  const ovr = peakOvr(state);
  const path = careerPath(state);
  const trophies = trophyCase(state);
  const awards = awardCase(state);

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
      // The share image redraws the same two rows, so it needs them both.
      path: path
        .map((p) => `${nameOf(p.partnerId)}|${countryOf(p.partnerId)}|${p.titles}`)
        .join(";"),
      trophies: trophies.map((tr) => `${tr.category}|${tr.count}`).join(";"),
      awards: awards.map((a) => `${a.type}|${a.count}`).join(";"),
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
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="rise panel overflow-hidden">
        {/* Identity strip — capsules, as on the reference card */}
        <header className="flex flex-wrap items-start gap-4 p-5">
          <OvrBadge value={ovr} size="lg" label={t("peakOvr")} />

          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Flag iso={state.you.country} className="!px-1.5 !py-1 !text-[11px]" />
              <span className="chip label !text-[10px] !text-[color:var(--color-muted)]">
                {state.you.currentSide === "drive" ? "DRIVE" : "REVÉS"}
              </span>
              <span className="chip num text-xs font-bold">
                <span className="label !text-[9px]">{t("peakRank")}</span>#{peak}
              </span>
              <span className="chip num text-xs font-bold">
                <span className="label !text-[9px]">{tBoard("earnings")}</span>
                {euro(state.earnings)}
              </span>
            </div>

            <h1 className="truncate text-2xl font-black leading-none sm:text-3xl">
              {state.you.name}
            </h1>

            <div className="chip !gap-0 divide-x divide-[color:var(--color-line)] !px-0 !py-0">
              {(
                [
                  [tBoard("titles"), state.titles],
                  [tBoard("finals"), state.finals],
                  [tBoard("weeksAtNo1"), state.weeksAtNo1],
                ] as const
              ).map(([label, value]) => (
                <span key={label} className="flex flex-col items-center px-4 py-1.5">
                  <span className="num text-base font-black leading-none">{value}</span>
                  <span className="label mt-1 !text-[9px]">{label}</span>
                </span>
              ))}
            </div>
          </div>
        </header>

        {/* Legacy tier */}
        <div className="mx-5 mb-5 rounded-xl border border-[color:var(--color-accent)]/30 bg-[color:var(--color-accent)]/[0.07] px-4 py-3">
          <p className="text-lg font-black uppercase tracking-wider text-[color:var(--color-accent)]">
            {t(`tier.${tier}`)}
          </p>
          <p className="mt-0.5 text-xs text-[color:var(--color-muted)]">{t(`tier.${tier}Blurb`)}</p>
        </div>

        {/* PATH — the partners, in career order */}
        <section className="border-t border-[color:var(--color-line-soft)] px-5 py-5">
          <h2 className="label text-center tracking-[0.3em]">{t("path")}</h2>

          <ul className="mt-4 flex flex-wrap items-start justify-center gap-x-4 gap-y-4">
            {path.map((p) => (
              <li key={p.partnerId} className="flex w-20 flex-col items-center gap-1.5">
                <span className="relative flex h-14 w-14 items-center justify-center rounded-full border border-[color:var(--color-line)] bg-white/[0.05] text-sm font-black">
                  {initials(nameOf(p.partnerId))}
                  {p.titles > 0 ? (
                    <span className="num absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-[color:var(--color-ink)] bg-[color:var(--color-accent)] px-1 text-[10px] font-black text-[color:var(--color-ink)]">
                      {p.titles}
                    </span>
                  ) : null}
                </span>
                <Flag iso={countryOf(p.partnerId)} />
                <span className="w-full truncate text-center text-[10px] leading-tight text-[color:var(--color-muted)]">
                  {nameOf(p.partnerId)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* TROPHIES — titles by level, plus individual honours */}
        <section className="border-t border-[color:var(--color-line-soft)] px-5 py-5">
          <h2 className="label text-center tracking-[0.3em]">{t("trophies")}</h2>

          {trophies.length === 0 && awards.length === 0 ? (
            <p className="mt-3 text-center text-xs uppercase tracking-wider text-[color:var(--color-faint)]">
              {tAwards("empty")}
            </p>
          ) : (
            <ul className="mt-4 flex flex-wrap items-start justify-center gap-x-5 gap-y-4">
              {trophies.map((tr) => (
                <li key={tr.category} className="flex w-16 flex-col items-center gap-1">
                  <span className="relative text-3xl leading-none">
                    <span aria-hidden>{TROPHY_GLYPH[tr.category] ?? "🏆"}</span>
                    {tr.count > 1 ? (
                      <span className="num absolute -bottom-1 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-ink)] px-1 text-[10px] font-black">
                        ×{tr.count}
                      </span>
                    ) : null}
                  </span>
                  <span className="label !text-[9px]">{tCat(tr.category)}</span>
                </li>
              ))}

              {awards.map((a) => (
                <li key={a.type} className="flex w-16 flex-col items-center gap-1">
                  <span className="relative text-3xl leading-none">
                    <span aria-hidden>{AWARD_GLYPH[a.type] ?? "🏅"}</span>
                    {a.count > 1 ? (
                      <span className="num absolute -bottom-1 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-ink)] px-1 text-[10px] font-black">
                        ×{a.count}
                      </span>
                    ) : null}
                  </span>
                  <span className="label !text-[9px] text-center leading-tight">
                    {tAwards(a.type)}
                  </span>
                </li>
              ))}
            </ul>
          )}
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

/** Two letters standing in for a crest — padel partners have no badge. */
function initials(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
