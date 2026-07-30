"use client";

import { useTranslations } from "next-intl";

import type { Band } from "../lib/data/types";
import type { DecisionCard, DecisionResolution, EventOption } from "../lib/sim/types";
import { TAG_TONE_CLASS } from "../lib/ui/format";
import { Flag, RatingPill } from "./ui/Pills";

/**
 * A decision card (§10): bold title, one-line description, then 2-4 option
 * cards each carrying stacked consequence tags. An option can show a green
 * upside and a red downside at once — that mixed signal is the whole point.
 *
 * Every string here is resolved from a key the engine emitted. The component
 * never invents copy, which is what keeps EN/PT in lockstep.
 */
export function DecisionPanel({
  card,
  resolution,
  nameOf,
  countryOf,
  ovrOf,
  onChoose,
  onAcknowledge,
}: {
  card: DecisionCard | null;
  resolution: DecisionResolution | null;
  nameOf: (id: string) => string;
  countryOf: (id: string) => string;
  ovrOf: (id: string) => number;
  onChoose: (optionId: string) => void;
  onAcknowledge: () => void;
}) {
  const t = useTranslations();
  const tDecision = useTranslations("decision");

  if (resolution) {
    return (
      <div className="rise panel p-4">
        <h2 className="label">{tDecision("outcome")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-text)]">
          {t(resolution.resultKey)}
        </p>
        <button
          type="button"
          onClick={onAcknowledge}
          autoFocus
          className="mt-4 w-full rounded-lg bg-[color:var(--color-accent)] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[color:var(--color-ink)] transition-transform hover:brightness-110 active:scale-[0.99]"
        >
          {tDecision("next")}
        </button>
      </div>
    );
  }

  if (!card) return null;

  return (
    <div className="rise panel p-4">
      <h2 className="label">{tDecision("heading")}</h2>
      <h3 className="mt-1.5 text-base font-bold leading-snug">
        {t(card.titleKey, card.values ?? {})}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-[color:var(--color-muted)]">
        {t(card.descriptionKey, card.values ?? {})}
      </p>

      {/* Partner-market cards carry full player names, which need room; other
          cards have short labels and can take a third column. */}
      <div
        className={`mt-3 grid gap-2 ${
          card.options.some((o) => o.partnerId)
            ? "sm:grid-cols-2"
            : card.options.length >= 3
              ? "sm:grid-cols-3"
              : "sm:grid-cols-2"
        }`}
      >
        {card.options.map((option) => (
          <OptionCard
            key={option.id}
            option={option}
            cardValues={card.values}
            nameOf={nameOf}
            countryOf={countryOf}
            ovrOf={ovrOf}
            onChoose={onChoose}
          />
        ))}
      </div>
    </div>
  );
}

/** Tier label under a partner offer — the analogue of `LaLiga / Championship`. */
function bandLabelKey(band: Band): string {
  return `board.bands.${band}`;
}

function OptionCard({
  option,
  cardValues,
  nameOf,
  countryOf,
  ovrOf,
  onChoose,
}: {
  option: EventOption;
  /** Card-level values, so options like "Stay with {partner}" resolve too. */
  cardValues?: Record<string, string | number>;
  nameOf: (id: string) => string;
  countryOf: (id: string) => string;
  ovrOf: (id: string) => number;
  onChoose: (optionId: string) => void;
}) {
  const t = useTranslations();
  const partnerName = option.partnerId ? nameOf(option.partnerId) : undefined;

  return (
    <button
      type="button"
      onClick={() => onChoose(option.id)}
      className="group flex flex-col gap-2 rounded-lg border border-[color:var(--color-line)] bg-white/[0.02] p-3 text-left transition-colors hover:border-[color:var(--color-accent)]/50 hover:bg-[color:var(--color-accent)]/[0.06]"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-xs font-bold leading-snug">
          {/* An offer names its own partner; "stay" falls back to the card's
              current partner, which is the one it is asking you to keep. */}
          {t(option.labelKey, { ...cardValues, ...(partnerName ? { partner: partnerName } : {}) })}
        </span>
        {option.partnerId ? (
          <span className="flex shrink-0 items-center gap-1">
            <Flag iso={countryOf(option.partnerId)} />
            <RatingPill value={ovrOf(option.partnerId)} />
          </span>
        ) : null}
      </span>

      {/* The circuit-band tier label that tells you the level you are buying into. */}
      {option.partnerBand ? (
        <span className="label text-[color:var(--color-accent)]">
          {t(bandLabelKey(option.partnerBand))}
        </span>
      ) : null}

      <span className="flex flex-wrap gap-1">
        {option.tags.map((tag, i) => (
          <span
            key={`${tag.key}-${i}`}
            className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-tight ${TAG_TONE_CLASS[tag.tone]}`}
          >
            {t(tag.key, tag.values ?? {})}
          </span>
        ))}
      </span>
    </button>
  );
}
