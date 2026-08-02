"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { useRouter } from "../lib/i18n/navigation";
import type { Pace, Tour } from "../lib/data/types";

/** Landing controls: tour, pace, and the button into the creator (§14). */
export function StartPanel() {
  const t = useTranslations("landing");
  const router = useRouter();

  const [tour, setTour] = useState<Tour>("men");
  const [pace, setPace] = useState<Pace>("story");

  return (
    <div className="rise panel flex flex-col gap-5 p-5 sm:p-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Choice
          label={t("tour")}
          options={[
            { value: "men", label: t("tourMen") },
            { value: "women", label: t("tourWomen") },
          ]}
          value={tour}
          onChange={(v) => setTour(v as Tour)}
        />
        <Choice
          label={t("pace")}
          options={[
            { value: "story", label: t("paceStory"), hint: t("paceStoryHint") },
            { value: "quick", label: t("paceQuick"), hint: t("paceQuickHint") },
          ]}
          value={pace}
          onChange={(v) => setPace(v as Pace)}
        />
      </div>

      <button
        type="button"
        onClick={() => router.push(`/play?tour=${tour}&pace=${pace}`)}
        className="group relative w-full overflow-hidden rounded-xl bg-[color:var(--color-accent)] px-5 py-4 text-sm font-black uppercase tracking-[0.15em] text-[color:var(--color-ink)] shadow-[0_16px_40px_-18px_var(--color-accent)] transition-transform hover:brightness-110 active:scale-[0.99] sm:w-auto sm:self-start sm:px-12"
      >
        {/* A sheen that crosses the button on hover. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-full w-1/2 skew-x-[-20deg] bg-white/25 transition-[left] duration-500 group-hover:left-[150%]"
        />
        {t("start")}
      </button>
    </div>
  );
}

interface ChoiceOption {
  value: string;
  label: string;
  hint?: string;
}

function Choice({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ChoiceOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="label mb-2">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={active}
              className={`lift rounded-xl border px-3 py-2.5 text-left hover:lift-hover ${
                active
                  ? "border-[color:var(--color-accent)]/60 bg-[color:var(--color-accent)]/10 shadow-[0_0_0_1px_var(--color-accent)_inset]"
                  : "border-[color:var(--color-line)] bg-white/[0.02] hover:border-[color:var(--color-line)] hover:bg-white/[0.05]"
              }`}
            >
              <span
                className={`block text-sm font-bold ${
                  active ? "text-[color:var(--color-accent)]" : "text-[color:var(--color-text)]"
                }`}
              >
                {option.label}
              </span>
              {option.hint ? (
                <span className="mt-0.5 block text-[11px] leading-snug text-[color:var(--color-faint)]">
                  {option.hint}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
