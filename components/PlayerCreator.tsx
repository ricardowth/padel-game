"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import type { Playstyle, Side, Tour } from "../lib/data/types";
import { createPlayer, type CreatePlayerInput } from "../lib/sim/career";
import { createRng } from "../lib/sim/rng";
import { allCountries } from "../lib/ui/format";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Flag, OvrBadge, RatingPill } from "./ui/Pills";

const STYLES: Playstyle[] = ["power", "playmaker", "counter", "allcourt"];

/**
 * "Define your identity" (§14) — three columns: identity, nationality, and a
 * top-down court that replaces the reference's football pitch. Every choice
 * feeds the live OVR preview, so the trade-offs are visible before you commit.
 */
export function PlayerCreator({
  tour,
  busy,
  onConfirm,
}: {
  tour: Tour;
  busy: boolean;
  onConfirm: (input: CreatePlayerInput, seed: string) => void;
}) {
  const t = useTranslations("creator");
  const tAttr = useTranslations("attributes");
  const tBoard = useTranslations("board");
  const locale = useLocale();

  const [name, setName] = useState("");
  const [country, setCountry] = useState("ES");
  const [side, setSide] = useState<Side>("reves");
  const [playstyle, setPlaystyle] = useState<Playstyle>("playmaker");
  const [handedness, setHandedness] = useState<"left" | "right">("right");
  const [query, setQuery] = useState("");

  const countries = useMemo(() => allCountries(locale), [locale]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? countries.filter((c) => c.name.toLowerCase().includes(q)) : countries;
  }, [countries, query]);

  // Seeded off the identity so the preview matches the career you actually get.
  const seed = `${name || "player"}-${country}-${side}-${playstyle}-${handedness}`;
  const preview = useMemo(
    () =>
      createPlayer(
        { name: name || "—", country, tour, side, playstyle, handedness },
        createRng(seed),
      ),
    [country, handedness, name, playstyle, seed, side, tour],
  );

  const ready = name.trim().length > 0;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-black tracking-tight sm:text-2xl">{t("title")}</h1>
          <p className="mt-1 text-xs text-[color:var(--color-muted)]">{t("subtitle")}</p>
        </div>
        <LanguageSwitcher />
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Column 1 — identity */}
        <section className="panel flex flex-col gap-4 p-4">
          <h2 className="label">{t("identity")}</h2>

          <div className="flex items-center gap-3 rounded-lg border border-[color:var(--color-line)] bg-white/[0.02] p-3">
            <OvrBadge value={preview.ovr} size="md" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 truncate text-sm font-bold">
                <Flag iso={country} />
                {name.trim() || t("lastNamePlaceholder")}
              </div>
              <div className="label mt-1">
                {t("startingOvr")} · {t("potential")} {preview.potential}
              </div>
            </div>
          </div>

          <label className="block">
            <span className="label">{t("lastName")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("lastNamePlaceholder")}
              maxLength={24}
              className="mt-1 w-full rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-ink)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-accent)]/60"
            />
          </label>

          <div>
            <span className="label">{t("hand")}</span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(["left", "right"] as const).map((hand) => (
                <Toggle
                  key={hand}
                  active={handedness === hand}
                  onClick={() => setHandedness(hand)}
                  label={hand === "left" ? t("handLeft") : t("handRight")}
                />
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-[color:var(--color-faint)]">{t("handHint")}</p>
          </div>

          <div>
            <span className="label">{tBoard("attributes")}</span>
            <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
              {(Object.keys(preview.attributes) as (keyof typeof preview.attributes)[]).map((key) => (
                <li key={key} className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] text-[color:var(--color-muted)]">
                    {tAttr(key)}
                  </span>
                  <RatingPill value={preview.attributes[key]} />
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Column 2 — nationality */}
        <section className="panel flex min-h-0 flex-col gap-3 p-4">
          <h2 className="label">{t("nationality")}</h2>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchCountry")}
            className="w-full rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-ink)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-accent)]/60"
          />
          <ul className="grid max-h-[22rem] grid-cols-2 gap-1 overflow-y-auto pr-1">
            {filtered.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => setCountry(c.code)}
                  aria-pressed={country === c.code}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
                    country === c.code
                      ? "bg-[color:var(--color-accent)]/12 text-[color:var(--color-accent)]"
                      : "text-[color:var(--color-muted)] hover:bg-white/[0.04]"
                  }`}
                >
                  <Flag iso={c.code} />
                  <span className="truncate">{c.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Column 3 — side & style */}
        <section className="panel flex flex-col gap-4 p-4">
          <div>
            <h2 className="label">{t("sideTitle")}</h2>
            <p className="mt-1 text-[11px] text-[color:var(--color-faint)]">{t("sideHint")}</p>
          </div>

          <Court side={side} onPick={setSide} revesLabel={t("reves")} driveLabel={t("drive")} />

          <p className="text-[11px] leading-snug text-[color:var(--color-muted)]">
            {side === "drive" ? t("driveHint") : t("revesHint")}
          </p>

          <div>
            <span className="label">{t("playstyle")}</span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {STYLES.map((style) => (
                <Toggle
                  key={style}
                  active={playstyle === style}
                  onClick={() => setPlaystyle(style)}
                  label={t(`style.${style}`)}
                />
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-[color:var(--color-faint)]">
              {t(`style.${playstyle}Hint`)}
            </p>
          </div>
        </section>
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        {!ready ? (
          <span className="text-[11px] text-[color:var(--color-faint)]">{t("nameRequired")}</span>
        ) : null}
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() =>
            onConfirm({ name: name.trim(), country, tour, side, playstyle, handedness }, seed)
          }
          className="rounded-lg bg-[color:var(--color-accent)] px-8 py-3 text-sm font-bold uppercase tracking-wider text-[color:var(--color-ink)] transition-transform hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-35"
        >
          {t("confirm")}
        </button>
      </div>
    </main>
  );
}

function Toggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
        active
          ? "border-[color:var(--color-accent)]/60 bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)]"
          : "border-[color:var(--color-line)] bg-white/[0.02] text-[color:var(--color-muted)] hover:bg-white/[0.05]"
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Top-down padel court. Revés is the left half, Drive the right — the direct
 * analogue of the reference's clickable pitch positions.
 */
function Court({
  side,
  onPick,
  revesLabel,
  driveLabel,
}: {
  side: Side;
  onPick: (side: Side) => void;
  revesLabel: string;
  driveLabel: string;
}) {
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-[color:var(--color-line)] bg-[#0d2a3d]">
      {/* Service line and net, drawn rather than imported so there is no asset to load. */}
      <div className="pointer-events-none absolute inset-3 rounded border-2 border-white/25" />
      <div className="pointer-events-none absolute left-3 right-3 top-1/2 h-0.5 -translate-y-1/2 bg-white/40" />
      <div className="pointer-events-none absolute bottom-3 left-1/2 top-1/2 w-0.5 -translate-x-1/2 bg-white/25" />

      <div className="absolute inset-0 top-1/2 grid grid-cols-2">
        {(["reves", "drive"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onPick(value)}
            aria-pressed={side === value}
            className={`m-2 flex items-end justify-center rounded pb-3 text-[11px] font-bold uppercase tracking-widest transition-colors ${
              side === value
                ? "bg-[color:var(--color-accent)]/25 text-white ring-2 ring-[color:var(--color-accent)]"
                : "text-white/55 hover:bg-white/10"
            }`}
          >
            {value === "reves" ? revesLabel : driveLabel}
          </button>
        ))}
      </div>
    </div>
  );
}
