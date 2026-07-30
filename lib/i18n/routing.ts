import { defineRouting } from "next-intl/routing";

/**
 * Launch locales are EN + PT (§14). Adding a language is meant to be a one-file
 * job: drop `messages/<locale>.json` in and add the code here — no component
 * changes, because nothing renders a hardcoded string.
 */
export const LOCALES = ["en", "pt", "es"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Shown in the language switcher; endonyms, so each reads in its own language. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  pt: "Português",
  es: "Español",
};

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
});
