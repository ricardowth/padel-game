/**
 * Phase 0 — profile enrichment.
 *
 * The ranking endpoint gives name/country/rank/points but no biographical data.
 * Each player's profile page embeds a JSON-LD block plus a structured
 * description string:
 *
 *   "<Name> - Points: N; Ranking: N; Personal Informations: Height: 1.90;
 *    Place of Birth: Valladolid; Birth Date: 08/03/2002; Playing Position: Right;"
 *
 * "Playing Position" is the real court side (Right = drive, Left = reves), which
 * beats guessing. This script scrapes that for every player in the raw ranking
 * snapshots and writes /data/raw/profiles.<tour>.json.
 *
 *   node scripts/fetch-profiles.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RAW_DIR = resolve(ROOT, "data/raw");
const UA = "Mozilla/5.0 (padel-career-sim data build; one-off snapshot)";

/** How many promise players to enrich per tour (plan asks for ~50). */
const PROMISE_LIMIT = 60;
const CONCURRENCY = 4;

/** Pulls the `key: value;` pairs out of the profile description string. */
function parseDescription(html) {
  const match = html.match(/"description":"([^"]{0,600})/);
  if (!match) return {};
  const text = match[1].replace(/\\\//g, "/");

  const field = (label) => {
    const m = text.match(new RegExp(`${label}:\\s*([^;"]+)`));
    return m ? m[1].trim() : undefined;
  };

  const jsonLdBirth = html.match(/"birthDate":"(\d{4}-\d{2}-\d{2})"/);
  const rawBirth = field("Birth Date");

  return {
    height: field("Height"),
    birthPlace: field("Place of Birth"),
    // Prefer the ISO form from JSON-LD; fall back to the dd/mm/yyyy string.
    birthDate: jsonLdBirth ? jsonLdBirth[1] : isoFromDmy(rawBirth),
    playingPosition: field("Playing Position"),
  };
}

function isoFromDmy(value) {
  if (!value) return undefined;
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
}

async function fetchProfile(player) {
  const base = {
    player_id: player.player_id,
    name: player.name,
    surname: player.surname,
    url: player.url,
  };
  if (!player.url) return { ...base, error: "no-url" };

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(player.url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { ...base, ...parseDescription(await res.text()) };
    } catch (err) {
      if (attempt === 3) return { ...base, error: String(err.message ?? err) };
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
  }
  return base;
}

/** Simple fixed-size worker pool so we stay polite but don't take an hour. */
async function mapPool(items, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  let done = 0;

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        out[i] = await worker(items[i]);
        if (++done % 25 === 0) console.log(`    ${done}/${items.length}`);
      }
    }),
  );

  return out;
}

const readRaw = async (name) => JSON.parse(await readFile(resolve(RAW_DIR, name), "utf8"));

/** Promises arrive split by age category and region; collapse to one best row each. */
function dedupePromises(rows) {
  const best = new Map();
  for (const row of rows) {
    const prev = best.get(row.player_id);
    if (!prev || row.points > prev.points) best.set(row.player_id, row);
  }
  return [...best.values()].sort((a, b) => b.points - a.points).slice(0, PROMISE_LIMIT);
}

async function main() {
  for (const tour of ["men", "women"]) {
    const seniors = (await readRaw(`ranking.${tour}.json`)).players;
    const promises = dedupePromises((await readRaw(`promises.${tour}.json`)).players);

    // One player can appear on both ladders; fetch each page once.
    const byId = new Map();
    for (const p of [...seniors, ...promises]) if (!byId.has(p.player_id)) byId.set(p.player_id, p);
    const targets = [...byId.values()];

    console.log(`${tour}: enriching ${targets.length} profiles`);
    const profiles = await mapPool(targets, fetchProfile);

    const file = resolve(RAW_DIR, `profiles.${tour}.json`);
    await writeFile(
      file,
      JSON.stringify({ tour, fetchedAt: new Date().toISOString(), profiles }, null, 2) + "\n",
      "utf8",
    );

    const withSide = profiles.filter((p) => p.playingPosition).length;
    const withDob = profiles.filter((p) => p.birthDate).length;
    console.log(
      `  wrote data/raw/profiles.${tour}.json — side ${withSide}/${profiles.length}, dob ${withDob}/${profiles.length}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
