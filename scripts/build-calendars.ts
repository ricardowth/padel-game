/**
 * Phase 0 — turn the scraped 2026 calendars into the Tournament schema (§8, §12).
 *
 *   data/raw/calendar.premier.json -> data/calendar.premier.json  (Majors, P1, P2, Finals)
 *   data/raw/calendar.fip.json     -> data/calendar.fip.json      (Bronze -> Platinum)
 *
 * In-game year 1 replays this calendar verbatim; later years are procedurally
 * rotated from it by the sim, so what matters here is that the category mix,
 * week rhythm and venue list are real.
 *
 *   npm run data:build
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { pointsTableFor, prizeTableFor, type PointsFile } from "../lib/data/points";
import type { CalendarFile, Category, Tour, Tournament } from "../lib/data/types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = resolve(ROOT, "data/raw");
const OUT = resolve(ROOT, "data");

const points = JSON.parse(readFileSync(resolve(OUT, "points.json"), "utf8")) as PointsFile;

/** padelfip.com encodes the category in each <article>'s class name. */
const CATEGORY_BY_CLASS: Record<string, Category> = {
  "fip-tour-bronze": "bronze",
  "fip-tour-silver": "silver",
  "fip-tour-gold": "gold",
  "fip-tour-platinum": "platinum",
  "fip-pp-p2": "p2",
  "fip-ppt-p1": "p1",
  "fip-ppt-major": "major",
  "fip-pp-master-finals": "finals",
};

/**
 * The Qatar Major is listed as POSTPONED with no replacement date. The game
 * needs a complete Major slate, so it is restored to the window it was
 * originally scheduled for. This is the only date in either calendar we invent.
 */
const RESCHEDULED: Record<string, { startDate: string; endDate: string }> = {
  "QATAR MAJOR": { startDate: "2026-04-06", endDate: "2026-04-11" },
};

/**
 * English country name -> ISO alpha-2. Built by inverting Intl's region names
 * so we get all ~250 for free, plus the handful of labels FIP writes its own way.
 */
const COUNTRY_ALIASES: Record<string, string> = {
  "great britain": "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  "united kingdom": "GB",
  "united states of america": "US",
  usa: "US",
  "czech republic": "CZ",
  "republic of ireland": "IE",
  holland: "NL",
  "south korea": "KR",
  "korea republic": "KR",
  "chinese taipei": "TW",
  "ivory coast": "CI",
  "cape verde": "CV",
  "bosnia herzegovina": "BA",
  "north macedonia": "MK",
  uae: "AE",
  "u.a.e.": "AE",
  swiss: "CH",
  "hong kong": "HK",
  turkey: "TR",
  turkiye: "TR",
  "principality of andorra": "AD",
  // FIP writes the venue's state instead of the country for this one event.
  "arizona us": "US",
};

function buildCountryIndex(): Map<string, string> {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const index = new Map<string, string>();

  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      let label: string | undefined;
      try {
        label = names.of(code);
      } catch {
        continue;
      }
      // Intl echoes the code back for unassigned regions.
      if (!label || label === code) continue;

      // Several deprecated codes share a name with a live one (FX "France" vs FR,
      // for instance). Codes are visited alphabetically and the canonical one
      // sorts first in every such pair, so first write wins.
      const key = label.toLowerCase();
      if (!index.has(key)) index.set(key, code);
    }
  }

  for (const [name, code] of Object.entries(COUNTRY_ALIASES)) index.set(name, code);
  return index;
}

const COUNTRY_INDEX = buildCountryIndex();
const unmappedCountries = new Set<string>();

/** A few FIP listings leave the country blank; resolve those by host city. */
const CITY_FALLBACK: Record<string, string> = {
  belfast: "GB",
};

function toIso(countryName: string, city: string): string {
  const key = countryName.trim().toLowerCase();
  const code = key ? COUNTRY_INDEX.get(key) : CITY_FALLBACK[city.trim().toLowerCase()];
  if (!code) unmappedCountries.add(countryName || `(blank, city: ${city})`);
  return code ?? "";
}

/** ISO-8601 week number. */
function isoWeek(isoDate: string): number {
  const d = new Date(`${isoDate}T00:00:00Z`);
  // Shift to the Thursday of this week — that's the week ISO-8601 counts.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

const slug = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Title-cases FIP's ALL-CAPS event names without mangling short connectors. */
const LOWERCASE_WORDS = new Set(["de", "del", "la", "le", "du", "di", "of", "the", "y", "and", "en"]);

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(" ")
    .map((word, i) => {
      if (word === "fip" || word === "p1" || word === "p2") return word.toUpperCase();
      // FIP numbers repeat events with roman numerals ("EGYPT III").
      if (/^[ivx]+$/.test(word)) return word.toUpperCase();
      if (i > 0 && LOWERCASE_WORDS.has(word)) return word;
      return word.replace(/^([a-zà-ÿ])/, (c) => c.toUpperCase());
    })
    .join(" ");
}

interface RawEvent {
  title: string;
  categoryClass: string;
  city: string;
  country: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  tours: Tour[];
  url: string | null;
}

interface RawCalendar {
  year: number;
  source: { provider: string; url: string };
  fetchedAt: string;
  events: RawEvent[];
}

function toTournament(event: RawEvent, category: Category, seenIds: Set<string>): Tournament | null {
  const spec = points.categories[category];
  const dates = RESCHEDULED[event.title] ?? {
    startDate: event.startDate ?? "",
    endDate: event.endDate ?? "",
  };
  if (!dates.startDate) return null; // still undated — not playable

  // Event names repeat across a season (multiple "FIP BRONZE MADRID"); suffix dupes.
  let id = `${category}-${slug(event.city || event.title)}-${slug(event.title).slice(0, 28)}`;
  if (seenIds.has(id)) {
    let n = 2;
    while (seenIds.has(`${id}-${n}`)) n++;
    id = `${id}-${n}`;
  }
  seenIds.add(id);

  return {
    id,
    name: titleCase(event.title),
    city: event.city,
    country: toIso(event.country, event.city),
    category,
    band: spec.band,
    week: isoWeek(dates.startDate),
    points: pointsTableFor(spec, points),
    prize: prizeTableFor(spec, points),
    tours: event.tours.length > 0 ? event.tours : ["men", "women"],
    startDate: dates.startDate,
    endDate: dates.endDate || dates.startDate,
  };
}

function build(rawName: string, keep: Category[], id: string, note: string): CalendarFile {
  const raw = JSON.parse(readFileSync(resolve(RAW, rawName), "utf8")) as RawCalendar;
  const allowed = new Set(keep);
  const seenIds = new Set<string>();
  const dropped: string[] = [];

  const tournaments = raw.events
    .map((event) => {
      const category = CATEGORY_BY_CLASS[event.categoryClass];
      if (!category || !allowed.has(category)) return null;

      const tournament = toTournament(event, category, seenIds);
      if (!tournament) dropped.push(`${event.title} (${event.status})`);
      return tournament;
    })
    .filter((t): t is Tournament => t !== null)
    .sort((a, b) => a.week - b.week || a.id.localeCompare(b.id));

  if (dropped.length > 0) console.log(`  skipped undated: ${dropped.join(", ")}`);

  return {
    id,
    year: raw.year,
    source: { provider: raw.source.provider, note },
    tournaments,
  };
}

function write(name: string, file: CalendarFile) {
  writeFileSync(resolve(OUT, name), JSON.stringify(file, null, 2) + "\n", "utf8");

  const byCategory = file.tournaments.reduce<Record<string, number>>((acc, t) => {
    acc[t.category] = (acc[t.category] ?? 0) + 1;
    return acc;
  }, {});
  const weeks = file.tournaments.map((t) => t.week);
  console.log(
    `  data/${name}: ${file.tournaments.length} tournaments, weeks ${Math.min(...weeks)}-${Math.max(...weeks)}, ` +
      Object.entries(byCategory)
        .map(([k, v]) => `${k} ${v}`)
        .join(", "),
  );
}

export function buildCalendars() {
  console.log("calendars:");

  write(
    "calendar.premier.json",
    build(
      "calendar.premier.json",
      ["p2", "p1", "major", "finals"],
      "premier-2026",
      "Qatar Airways Premier Padel Tour 2026, scraped verbatim. The postponed Qatar Major " +
        "is restored to its originally scheduled 6-11 April window so the Major slate is complete.",
    ),
  );

  write(
    "calendar.fip.json",
    build(
      "calendar.fip.json",
      ["bronze", "silver", "gold", "platinum"],
      "fip-2026",
      "CUPRA FIP Tour 2026, scraped verbatim. Junior/Promises, FIP Beyond, Championship, " +
        "Olympic Path and Hexagon events are excluded — they are not part of a pro career ladder.",
    ),
  );

  if (unmappedCountries.size > 0) {
    console.warn(`  WARNING unmapped countries: ${[...unmappedCountries].join(", ")}`);
  }
}

buildCalendars();
