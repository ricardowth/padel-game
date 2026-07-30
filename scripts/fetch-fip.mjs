/**
 * Phase 0 — raw data acquisition.
 *
 * Pulls the live FIP rankings (senior "master" ladder + the FIP Promises/NextGen
 * ladders) off padelfip.com's public WordPress REST endpoint and parks the raw
 * JSON in /data/raw. Nothing here interprets the data — build-data.ts does that.
 *
 * Re-run only when you want to refresh the snapshot; /data/raw is committed so
 * the build is reproducible offline.
 *
 *   node scripts/fetch-fip.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RAW_DIR = resolve(ROOT, "data/raw");

const API = "https://www.padelfip.com/es/wp-json/fip/v1/ranking/load-more/";
const UA = "Mozilla/5.0 (padel-career-sim data build; one-off snapshot)";

/** Ranking week the snapshot is pinned to. */
const YEAR = 2026;
const WEEK = 31;

const PAGE_SIZE = 20;
const SENIOR_TARGET = 220; // fetch a little past 200 so ties at the tail don't truncate us
const PROMISE_REGIONS = ["european", "american", "african", "asian"];
const PROMISE_CATEGORIES = ["under18", "under16"];

/** The endpoint 500s under rapid-fire requests; keep it polite. */
const DELAY_MS = 350;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPage({ gender, category, circuit, offset, limit }) {
  const qs = new URLSearchParams({
    gender,
    category,
    circuit,
    year: String(YEAR),
    week: String(WEEK),
    offset: String(offset),
    limit: String(limit),
    lang: "en",
  });

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`${API}?${qs}`, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (body && body.error) throw new Error(`API error: ${JSON.stringify(body.error)}`);
      return Array.isArray(body) ? body : [];
    } catch (err) {
      if (attempt === 4) throw err;
      await sleep(DELAY_MS * 2 ** attempt);
    }
  }
  return [];
}

/** Walks a ladder page by page until it runs dry or we have enough. */
async function fetchLadder({ gender, category, circuit, target }) {
  const rows = [];
  const seen = new Set();

  for (let offset = 0; rows.length < target; offset += PAGE_SIZE) {
    const page = await getPage({ gender, category, circuit, offset, limit: PAGE_SIZE });
    if (page.length === 0) break;

    // The endpoint pads short ladders by repeating the last page — dedupe defensively.
    let fresh = 0;
    for (const p of page) {
      if (seen.has(p.player_id)) continue;
      seen.add(p.player_id);
      rows.push(p);
      fresh++;
    }
    if (fresh === 0) break;

    await sleep(DELAY_MS);
  }

  return rows.slice(0, target);
}

async function save(name, payload) {
  const file = resolve(RAW_DIR, name);
  await writeFile(file, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`  wrote data/raw/${name} (${payload.players.length} players)`);
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  const fetchedAt = new Date().toISOString();
  const source = { api: API, year: YEAR, week: WEEK, fetchedAt };

  for (const [gender, tour] of [
    ["male", "men"],
    ["female", "women"],
  ]) {
    console.log(`FIP senior ranking — ${tour}`);
    const players = await fetchLadder({
      gender,
      category: "master",
      circuit: "premierpadel",
      target: SENIOR_TARGET,
    });
    await save(`ranking.${tour}.json`, { ...source, category: "master", tour, players });

    console.log(`FIP Promises ranking — ${tour}`);
    const promises = [];
    for (const category of PROMISE_CATEGORIES) {
      for (const circuit of PROMISE_REGIONS) {
        const rows = await fetchLadder({ gender, category, circuit, target: 60 });
        console.log(`  ${category}/${circuit}: ${rows.length}`);
        for (const row of rows) promises.push({ ...row, category, region: circuit });
      }
    }
    await save(`promises.${tour}.json`, { ...source, tour, players: promises });
  }

  console.log("\nDone. Raw snapshots in data/raw/.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
