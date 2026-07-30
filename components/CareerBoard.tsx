"use client";

import { useTranslations } from "next-intl";

import { careerEffectiveOvr } from "../lib/sim/partners";
import type { CareerEngine } from "../lib/sim/career";
import type { DecisionCard, DecisionResolution } from "../lib/sim/types";
import { euro } from "../lib/ui/format";
import { CareerLedger } from "./CareerLedger";
import { DecisionPanel } from "./DecisionPanel";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Flag, Meter, OvrBadge, RatingPill, SideTag, StatCell } from "./ui/Pills";

/**
 * The whole game on one dense dark screen (§14): identity + the active decision
 * on the left, the age-by-age career ledger on the right.
 */
export function CareerBoard({
  engine,
  pending,
  resolution,
  onChoose,
  onAcknowledge,
  simulatingLabel,
}: {
  engine: CareerEngine;
  pending: DecisionCard | null;
  resolution: DecisionResolution | null;
  onChoose: (optionId: string) => void;
  onAcknowledge: () => void;
  simulatingLabel: string;
}) {
  const t = useTranslations("board");
  const tAttr = useTranslations("attributes");

  const { state, world } = engine;
  const you = state.you;

  const nameOf = (id: string) => world.players.get(id)?.name ?? "—";
  const countryOf = (id: string) => world.players.get(id)?.country ?? "";
  const ovrOf = (id: string) => world.players.get(id)?.ovr ?? 0;

  const effectiveOvr = careerEffectiveOvr(state);
  const partnerName = state.partnerId ? nameOf(state.partnerId) : null;

  return (
    // Below lg the two panes stack and the page scrolls normally; the fixed
    // single-screen layout only applies where both columns actually fit.
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-3 p-3 sm:p-4 lg:h-screen lg:min-h-0">
      <header className="flex shrink-0 items-center justify-between">
        <span className="label">
          {t("season", { season: state.season })} · {t(`bands.${state.band}Short`)}
        </span>
        <LanguageSwitcher />
      </header>

      <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* LEFT — identity + decision */}
        <div className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:pr-0.5">
          <section className="panel p-4">
            <div className="flex items-start gap-3">
              <OvrBadge value={effectiveOvr} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Flag iso={you.country} className="text-[10px]" />
                  <SideTag
                    label={t(`sideShort.${you.currentSide}`)}
                    penalised={(state.sidePenalty?.seasonsLeft ?? 0) > 0}
                  />
                </div>
                <h1 className="mt-1 truncate text-lg font-black leading-tight">{you.name}</h1>
                <p className="truncate text-xs text-[color:var(--color-muted)]">
                  {partnerName ? t("with", { partner: partnerName }) : t("noPartner")}
                </p>
                <p className="num mt-1.5 text-[11px] text-[color:var(--color-faint)]">
                  {t("age")} {you.age} · {euro(state.earnings)} ·{" "}
                  {state.rank > 0 ? `#${state.rank}` : t("unranked")}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[color:var(--color-line-soft)] pt-3">
              <StatCell label={t("titles")} value={state.titles} />
              <StatCell label={t("finals")} value={state.finals} />
              <StatCell label={t("weeksAtNo1")} value={state.weeksAtNo1} />
            </div>

            {state.injury ? (
              <p className="mt-3 rounded border border-[color:var(--color-bad)]/30 bg-[color:var(--color-bad)]/10 px-2 py-1 text-[11px] font-semibold text-[color:var(--color-bad)]">
                {t("injured", { weeks: state.injury.weeks })}
              </p>
            ) : null}
            {state.banSeasonsLeft > 0 ? (
              <p className="mt-3 rounded border border-[color:var(--color-bad)]/30 bg-[color:var(--color-bad)]/10 px-2 py-1 text-[11px] font-semibold text-[color:var(--color-bad)]">
                {t("banned", { seasons: state.banSeasonsLeft })}
              </p>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-[color:var(--color-line-soft)] pt-3">
              <Meter label={t("chemistry")} value={state.chemistry} />
              <Meter
                label={t("form")}
                value={state.form}
                min={-50}
                max={100}
                tone="var(--color-r4)"
              />
              <Meter
                label={t("fatigue")}
                value={state.fatigue}
                tone="var(--color-bad)"
              />
              <Meter label={t("morale")} value={state.morale} tone="var(--color-r3)" />
            </div>
          </section>

          <DecisionPanel
            card={pending}
            resolution={resolution}
            nameOf={nameOf}
            countryOf={countryOf}
            ovrOf={ovrOf}
            onChoose={onChoose}
            onAcknowledge={onAcknowledge}
          />

          {!pending && !resolution ? (
            <p className="panel px-4 py-3 text-xs text-[color:var(--color-faint)]">
              {simulatingLabel}
            </p>
          ) : null}

          <section className="panel p-4">
            <h2 className="label">{t("attributes")}</h2>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              {(Object.keys(you.attributes) as (keyof typeof you.attributes)[]).map((key) => (
                <li key={key} className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] text-[color:var(--color-muted)]">
                    {tAttr(key)}
                  </span>
                  <RatingPill value={you.attributes[key]} />
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* RIGHT — the ledger */}
        <CareerLedger
          state={state}
          world={world}
          pendingLabel={pending || resolution ? t("decisionPending") : null}
        />
      </div>
    </main>
  );
}
