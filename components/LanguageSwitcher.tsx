"use client";

import { useLocale } from "next-intl";
import { useParams } from "next/navigation";
import { useTransition } from "react";

import { usePathname, useRouter } from "../lib/i18n/navigation";
import { LOCALES, LOCALE_LABELS, type Locale } from "../lib/i18n/routing";

/**
 * Swaps locale while staying on the current screen. The career itself lives in
 * memory, so this is only used on the landing screen and in the board header,
 * where a re-render costs nothing.
 */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          disabled={pending}
          aria-current={code === locale ? "true" : undefined}
          onClick={() =>
            startTransition(() => {
              router.replace(
                // @ts-expect-error — pathname is a valid route for every locale.
                { pathname, params },
                { locale: code },
              );
            })
          }
          className={`rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
            code === locale
              ? "bg-white/10 text-[color:var(--color-text)]"
              : "text-[color:var(--color-faint)] hover:text-[color:var(--color-muted)]"
          }`}
          title={LOCALE_LABELS[code]}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
