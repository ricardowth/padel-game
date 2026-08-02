/**
 * The i18n contract (§14): every locale carries identical keys, and every key
 * the sim engine emits exists in all of them. This is what makes "adding a
 * language = adding one file" true rather than aspirational — a missing key
 * fails here instead of rendering a raw `events.foo.title` to a player.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ALL_EVENTS } from "../sim/events";
import { LOCALES } from "./routing";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

type Catalog = Record<string, unknown>;

const load = (locale: string): Catalog =>
  JSON.parse(readFileSync(resolve(ROOT, `messages/${locale}.json`), "utf8")) as Catalog;

/** Flattens a nested catalog into dotted key paths. */
function flatten(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value as Catalog).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

const catalogs = Object.fromEntries(LOCALES.map((l) => [l, load(l)])) as Record<string, Catalog>;
const keys = Object.fromEntries(
  LOCALES.map((l) => [l, new Set(flatten(catalogs[l]))]),
) as Record<string, Set<string>>;

/** Reads a dotted path out of a catalog. */
function lookup(catalog: Catalog, path: string): unknown {
  return path.split(".").reduce<unknown>((node, part) => {
    if (typeof node !== "object" || node === null) return undefined;
    return (node as Catalog)[part];
  }, catalog);
}

const has = (locale: string, path: string) => typeof lookup(catalogs[locale]!, path) === "string";

describe("message catalogs", () => {
  it("ships every launch locale", () => {
    expect(LOCALES).toContain("en");
    expect(LOCALES).toContain("pt");
  });

  it.each(LOCALES.filter((l) => l !== "en"))(
    "%s has exactly the same keys as en",
    (locale) => {
      const missing = [...keys.en!].filter((k) => !keys[locale]!.has(k));
      const extra = [...keys[locale]!].filter((k) => !keys.en!.has(k));

      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    },
  );

  it("has no empty strings", () => {
    for (const locale of LOCALES) {
      for (const key of keys[locale]!) {
        const value = lookup(catalogs[locale]!, key);
        expect(typeof value === "string" && value.trim().length > 0).toBe(true);
      }
    }
  });

  it("keeps the same interpolation variables across locales", () => {
    const vars = (text: string) =>
      [...text.matchAll(/\{(\w+)/g)].map((m) => m[1]!).sort();

    for (const key of keys.en!) {
      const english = lookup(catalogs.en!, key);
      if (typeof english !== "string") continue;

      for (const locale of LOCALES) {
        if (locale === "en") continue;
        const translated = lookup(catalogs[locale]!, key);
        if (typeof translated !== "string") continue;
        expect({ key, locale, vars: vars(translated) }).toEqual({
          key,
          locale,
          vars: vars(english),
        });
      }
    }
  });
});

describe("every key the engine emits is translated", () => {
  // Build one card per event so titles, options, tags and results are all covered.
  const context = {
    career: {
      age: 24,
      ovr: 80,
      band: "professional" as const,
      rank: 40,
      season: 5,
      year: 2030,
      form: 0,
      fatigue: 30,
      morale: 60,
      chemistry: 50,
      earnings: 500_000,
      injured: false,
      partnerId: "P1",
      side: "drive" as const,
      naturalSide: "drive" as const,
      hasCoach: false,
      hasSponsor: false,
      firedEventIds: [],
      seasonTitles: 2,
      rankDelta: -10,
      qualifyingAttempts: 4,
      qualifyingFailures: 3,
      seasonNet: -12_000,
      poorDecisions: 3,
    },
    world: {} as never,
    nameOf: () => "Test Partner",
  };

  const cards = ALL_EVENTS.map((definition) => definition.build(context));

  it.each(LOCALES)("%s resolves every event key", (locale) => {
    const missing: string[] = [];

    for (const card of cards) {
      if (!has(locale, card.titleKey)) missing.push(card.titleKey);
      if (!has(locale, card.descriptionKey)) missing.push(card.descriptionKey);

      for (const option of card.options) {
        if (!has(locale, option.labelKey)) missing.push(option.labelKey);
        for (const tag of option.tags) if (!has(locale, tag.key)) missing.push(tag.key);
        for (const outcome of option.outcomes) {
          if (!has(locale, outcome.resultKey)) missing.push(outcome.resultKey);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it.each(LOCALES)("%s resolves the partner-market keys built at runtime", (locale) => {
    // These are assembled in career.ts from real players, so they never appear
    // in the catalog above.
    const runtimeKeys = [
      "events.drop_down.description_money",
      ...[
        "first_title", "title", "runner_up", "world_number_one", "reached_top",
        "rival_passed", "rival_lost", "qualifying_woes", "lost_money",
        "climbed", "slipped", "nothing_to_show", "banned",
      ].map((k) => `season.highlight.${k}`),
      "season.recap",
      "events.partner_market.title",
      "events.partner_market.description",
      "events.partner_market.title_dumped",
      "events.partner_market.description_dumped",
      "events.partner_market.options.offer",
      "events.partner_market.options.stay",
      "events.partner_market.results.accepted",
      "events.partner_market.results.stayed",
      "tags.partner_ovr",
      "tags.stronger_partner",
      "tags.side_switch",
      "tags.chemistry_reset",
      "tags.keep_chemistry",
      "tags.no_change",
    ];

    expect(runtimeKeys.filter((k) => !has(locale, k))).toEqual([]);
  });

  it.each(LOCALES)("%s names every award, tier, band and attribute", (locale) => {
    const required = [
      ...["fip_no1", "major", "best_smash", "breakout", "empty"].map((a) => `awards.${a}`),
      ...["journeyman", "contender", "champion", "legend"].flatMap((t) => [
        `result.tier.${t}`,
        `result.tier.${t}Blurb`,
      ]),
      ...["developmental", "professional", "elite"].flatMap((b) => [
        `board.bands.${b}`,
        `board.bands.${b}Short`,
      ]),
      ...["remate", "volea", "bandeja", "vibora", "defensa", "pared", "velocidad", "mental"].map(
        (a) => `attributes.${a}`,
      ),
      ...["power", "playmaker", "counter", "allcourt"].flatMap((s) => [
        `creator.style.${s}`,
        `creator.style.${s}Hint`,
      ]),
      "board.sideShort.drive",
      "board.sideShort.reves",
    ];

    expect(required.filter((k) => !has(locale, k))).toEqual([]);
  });
});

/**
 * Static sweep of the components for literal `t("...")` lookups.
 *
 * The parity test above only proves the locales agree with each other, so a key
 * that no locale has — because a component was renamed out from under it —
 * passes cleanly and then renders `result.finalOvr` to a player. This catches
 * that class of break at the only place it can be caught cheaply.
 */
describe("keys the components ask for actually exist", () => {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) return walk(full);
      return /\.tsx?$/.test(entry) ? [full] : [];
    });
  }

  /** `const t = useTranslations("board")` -> which namespace each name holds. */
  function namespacesIn(source: string): Map<string, string> {
    const out = new Map<string, string>();
    for (const m of source.matchAll(
      /const\s+(\w+)\s*=\s*useTranslations\(\s*(?:"([^"]*)")?\s*\)/g,
    )) {
      out.set(m[1]!, m[2] ?? "");
    }
    return out;
  }

  const files = walk(resolve(ROOT, "components"));

  it.each(LOCALES)("%s resolves every literal key used in a component", (locale) => {
    const missing: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const namespaces = namespacesIn(source);
      if (namespaces.size === 0) continue;

      for (const [name, namespace] of namespaces) {
        // Only literal, non-interpolated lookups can be checked statically.
        const calls = source.matchAll(
          new RegExp(String.raw`\b${name}\(\s*"([A-Za-z0-9_.]+)"`, "g"),
        );
        for (const call of calls) {
          const key = namespace ? `${namespace}.${call[1]}` : call[1]!;
          if (!has(locale, key)) missing.push(`${file.split(/[\\/]/).pop()}: ${key}`);
        }
      }
    }

    expect([...new Set(missing)]).toEqual([]);
  });
});
