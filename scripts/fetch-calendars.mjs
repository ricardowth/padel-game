/**
 * Phase 0 — calendar acquisition.
 *
 * Scrapes the official 2026 calendars off padelfip.com into /data/raw:
 *   - the Qatar Airways Premier Padel Tour page (Majors, P1, P2, Finals)
 *   - the full CUPRA FIP Tour page (Bronze -> Platinum, 200+ events)
 *
 * Both pages render every event server-side as an <article> whose class carries
 * the category, so a plain fetch + regex pass is enough — no JS execution.
 *
 *   node scripts/fetch-calendars.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RAW_DIR = resolve(ROOT, "data/raw");
const UA = "Mozilla/5.0 (padel-career-sim data build; one-off snapshot)";
const YEAR = 2026;

const SOURCES = [
  {
    out: "calendar.premier.json",
    url: `https://www.padelfip.com/calendar-premier-padel/?events-year=${YEAR}`,
  },
  {
    out: "calendar.fip.json",
    url: `https://www.padelfip.com/calendar/?events-year=${YEAR}`,
  },
];

const decode = (s) =>
  s
    .replace(/&#8211;/g, "-")
    .replace(/&#8217;/g, "'")
    .replace(/&#160;|&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

const stripTags = (s) => decode(s.replace(/<[^>]+>/g, " "));

/** Grabs the inner HTML of the first element carrying `className`. */
function block(html, className) {
  const m = html.match(new RegExp(`class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)</div>`));
  return m ? m[1] : "";
}

function parseArticle(html, categoryClass) {
  const titleMatch = html.match(/class="event-title"[\s\S]*?title="([^"]*)"/);
  const title = titleMatch ? decode(titleMatch[1]) : stripTags(block(html, "event-title"));

  const dates = stripTags(block(html, "date-start-end"));
  const location = stripTags(block(html, "event-location"));
  const link = (html.match(/href="(https:\/\/www\.padelfip\.com\/events\/[^"]+)"/) || [])[1];

  // "From 02/01/2026 to 04/01/2026" — absent when an event is postponed/cancelled.
  const range = dates.match(/From (\d{2})\/(\d{2})\/(\d{4}) to (\d{2})\/(\d{2})\/(\d{4})/);
  const status = range ? "scheduled" : decode(dates) || "unscheduled";

  // "Alsdorf - Germany"; city itself may contain a hyphen, so split on the last one.
  const cut = location.lastIndexOf(" - ");
  const city = cut >= 0 ? location.slice(0, cut).trim() : location;
  const country = cut >= 0 ? location.slice(cut + 3).trim() : "";

  // The gender block holds one Font Awesome glyph per tour the event serves.
  const gender = block(html, "gender-event") || "";
  const hasMen = /viewBox="0 0 192 512"/.test(gender);
  const hasWomen = /viewBox="0 0 256 512"/.test(gender);

  return {
    title,
    categoryClass,
    city,
    country,
    startDate: range ? `${range[3]}-${range[2]}-${range[1]}` : null,
    endDate: range ? `${range[6]}-${range[5]}-${range[4]}` : null,
    status,
    tours: [...(hasMen ? ["men"] : []), ...(hasWomen ? ["women"] : [])],
    url: link ?? null,
  };
}

function parseCalendar(html) {
  const articles = [...html.matchAll(/<article class="([^"]*)"([\s\S]*?)<\/article>/g)];
  return articles.map(([, cls, body]) => parseArticle(body, cls.trim()));
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });

  for (const { out, url } of SOURCES) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);

    const events = parseCalendar(await res.text());
    const payload = {
      year: YEAR,
      source: { provider: "padelfip.com", url },
      fetchedAt: new Date().toISOString(),
      events,
    };

    await writeFile(resolve(RAW_DIR, out), JSON.stringify(payload, null, 2) + "\n", "utf8");

    const byCategory = events.reduce((acc, e) => {
      acc[e.categoryClass] = (acc[e.categoryClass] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`wrote data/raw/${out} — ${events.length} events`);
    for (const [k, v] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(v).padStart(4)} ${k}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
