/**
 * Phase 0 — gate. Checks every generated file in /data against the §12 schemas
 * and the plan's balance targets, so a bad scrape or a mistuned curve fails
 * loudly here rather than halfway through a simulated career.
 *
 *   npm run data:validate
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ROUND_LADDER, roundsFor, type PointsFile } from "../lib/data/points";
import {
  ATTRIBUTE_KEYS,
  type CalendarFile,
  type Category,
  type Player,
  type PlayerPoolFile,
  type Tournament,
} from "../lib/data/types";
import { computeOvr, OVR_MAX, OVR_MIN } from "../lib/sim/ovr";

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), "../data");
const read = <T>(name: string): T => JSON.parse(readFileSync(resolve(DATA, name), "utf8")) as T;

const failures: string[] = [];
const notes: string[] = [];

const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures.push(detail ? `${label}: ${detail}` : label);
};

const SIDES = new Set(["drive", "reves"]);
const PLAYSTYLES = new Set(["power", "playmaker", "counter", "allcourt"]);
const BANDS = new Set(["developmental", "professional", "elite"]);
const CATEGORIES = new Set<Category>([
  "bronze",
  "silver",
  "gold",
  "platinum",
  "p2",
  "p1",
  "major",
  "finals",
]);

function validatePlayer(player: Player, where: string, kind: "senior" | "promise") {
  const at = `${where} ${player.id} (${player.name})`;

  check(at, typeof player.id === "string" && player.id.length > 0, "missing id");
  check(at, typeof player.name === "string" && player.name.trim().length > 1, "bad name");
  // Display names are shortened at build time; anything longer than a forename
  // plus a compound surname will not fit the ledger's partner column.
  check(
    at,
    player.name.split(" ").length <= 3,
    `display name not shortened: "${player.name}"`,
  );
  check(at, !/\s[A-Za-z]\.?$/.test(player.name), `display name ends in an initial: "${player.name}"`);
  check(at, /^[A-Z]{2}$/.test(player.country), `country not ISO alpha-2: "${player.country}"`);
  check(at, SIDES.has(player.naturalSide), `bad naturalSide "${player.naturalSide}"`);
  check(at, SIDES.has(player.currentSide), `bad currentSide "${player.currentSide}"`);
  check(at, PLAYSTYLES.has(player.playstyle), `bad playstyle "${player.playstyle}"`);
  check(at, player.isReal === true, "isReal should be true for FIP-sourced players");

  for (const key of ATTRIBUTE_KEYS) {
    const value = player.attributes[key];
    check(
      at,
      Number.isInteger(value) && value >= OVR_MIN && value <= OVR_MAX,
      `attribute ${key} out of range: ${value}`,
    );
  }

  check(
    at,
    Number.isInteger(player.ovr) && player.ovr >= OVR_MIN && player.ovr <= OVR_MAX,
    `ovr out of range: ${player.ovr}`,
  );
  check(
    at,
    computeOvr(player.attributes, player.currentSide) === player.ovr,
    `ovr ${player.ovr} disagrees with attributes (${computeOvr(player.attributes, player.currentSide)})`,
  );
  check(at, player.potential >= player.ovr, `potential ${player.potential} < ovr ${player.ovr}`);
  check(at, player.potential <= OVR_MAX, `potential above ${OVR_MAX}`);

  if (kind === "senior") {
    // Padel's ranked veterans really do run this old — Miguel Lamperti is 47 and
    // Carolina Navarro 50 in this snapshot. regen.ts retires them in-game.
    check(at, player.age >= 15 && player.age <= 52, `implausible age ${player.age}`);
    check(at, player.debutYear === undefined, "seniors should not carry debutYear");
  } else {
    // A 12-year-old can legitimately rank on the under-16 ladder; they simply
    // debut later, which is exactly the staggered intake §11 asks for.
    check(at, player.age >= 12 && player.age <= 19, `implausible promise age ${player.age}`);
    // The deepest wave arrives late on purpose (build-data's PROMISE_WAVE_SIZE),
    // so the ceiling has to cover a full 2026 -> 2045 career.
    check(
      at,
      typeof player.debutYear === "number" && player.debutYear >= 2026 && player.debutYear <= 2047,
      `bad debutYear ${player.debutYear}`,
    );
  }
}

function validatePool(name: string, kind: "senior" | "promise", expected: number) {
  const file = read<PlayerPoolFile>(name);

  check(name, file.kind === kind, `kind is "${file.kind}"`);
  check(name, file.players.length === expected, `expected ${expected}, got ${file.players.length}`);

  const ids = new Set<string>();
  for (const player of file.players) {
    check(name, !ids.has(player.id), `duplicate id ${player.id}`);
    ids.add(player.id);
    check(name, player.tour === file.tour, `${player.id} tour mismatch`);
    validatePlayer(player, name, kind);
  }

  // §11: the curve should run #1 ~ 95+ down to #200 ~ 60s, monotonically.
  if (kind === "senior") {
    const ovrs = file.players.map((p) => p.source?.fipRank ?? 0).map((_, i) => file.players[i]!.ovr);
    check(name, ovrs[0]! >= 95, `top player OVR is ${ovrs[0]} (want 95+)`);
    const last = ovrs[ovrs.length - 1]!;
    check(name, last >= 60 && last < 70, `#${ovrs.length} OVR is ${last} (want 60s)`);
    check(
      name,
      ovrs.every((ovr, i) => i === 0 || ovr <= ovrs[i - 1]!),
      "OVR is not monotonically non-increasing by rank",
    );
  }

  const sidesKnown = file.players.filter((p) => p.source?.sideKnown).length;
  const agesKnown = file.players.filter((p) => p.source?.ageKnown).length;
  const drive = file.players.filter((p) => p.naturalSide === "drive").length;
  notes.push(
    `${name}: ${file.players.length} players · real sides ${sidesKnown} · real ages ${agesKnown} · ` +
      `drive/reves ${drive}/${file.players.length - drive}`,
  );
}

function validatePoints(): PointsFile {
  const file = read<PointsFile>("points.json");

  check("points.json", file.roundLadder.length === ROUND_LADDER.length, "roundLadder length");
  check(
    "points.json",
    file.roundLadder.every((r, i) => r === ROUND_LADDER[i]),
    "roundLadder disagrees with lib/data/points.ts",
  );

  for (const round of ROUND_LADDER) {
    check("points.json", typeof file.roundShares[round] === "number", `missing roundShare ${round}`);
    check("points.json", typeof file.prizeShares[round] === "number", `missing prizeShare ${round}`);
  }

  // Shares must increase as you go deeper, and the title must be worth full value.
  for (const shares of [file.roundShares, file.prizeShares]) {
    check(
      "points.json",
      ROUND_LADDER.every((r, i) => i === 0 || shares[r] > shares[ROUND_LADDER[i - 1]!]),
      "shares are not strictly increasing across the ladder",
    );
    check("points.json", shares.winner === 1, "winner share must be 1");
  }

  for (const category of CATEGORIES) {
    const spec = file.categories[category];
    check("points.json", spec !== undefined, `missing category ${category}`);
    if (!spec) continue;
    check("points.json", BANDS.has(spec.band), `${category} bad band "${spec.band}"`);
    check("points.json", spec.winnerPoints > 0, `${category} winnerPoints`);
    check("points.json", spec.winnerPrize > 0, `${category} winnerPrize`);
    check("points.json", spec.directEntryRank > 0, `${category} directEntryRank`);
    check(
      "points.json",
      Number.isInteger(spec.qualifyingRounds) && spec.qualifyingRounds >= 0,
      `${category} qualifyingRounds`,
    );
    check("points.json", spec.entryCost >= 0, `${category} entryCost`);
    // A trip must be worth taking if you win it, or the category is a money pit.
    check(
      "points.json",
      spec.winnerPrize > spec.entryCost,
      `${category} winning does not cover the entry cost`,
    );
    check(
      "points.json",
      ROUND_LADDER.includes(spec.firstRound),
      `${category} bad firstRound "${spec.firstRound}"`,
    );
  }

  // §7's progression: each band should out-pay the one below it.
  const ladder: Category[] = ["bronze", "silver", "gold", "platinum", "p2", "p1", "major"];
  check(
    "points.json",
    ladder.every((c, i) => i === 0 || file.categories[c].winnerPoints > file.categories[ladder[i - 1]!].winnerPoints),
    "winner points do not increase up the circuit ladder",
  );
  // Climbing the ladder must get harder to enter and dearer to travel to,
  // otherwise there is no reason not to chase Premier events from rank 300.
  check(
    "points.json",
    ladder.every(
      (c, i) => i === 0 || file.categories[c].directEntryRank <= file.categories[ladder[i - 1]!].directEntryRank,
    ),
    "direct-entry ranks do not tighten up the circuit ladder",
  );
  check(
    "points.json",
    ladder.every((c, i) => i === 0 || file.categories[c].entryCost >= file.categories[ladder[i - 1]!].entryCost),
    "entry costs do not rise up the circuit ladder",
  );

  return file;
}

function validateCalendar(name: string, points: PointsFile, allowed: Category[], minEvents: number) {
  const file = read<CalendarFile>(name);
  const allowedSet = new Set(allowed);
  const ids = new Set<string>();

  check(name, file.year === 2026, `year is ${file.year}`);
  check(name, file.tournaments.length >= minEvents, `only ${file.tournaments.length} tournaments`);

  for (const t of file.tournaments as Tournament[]) {
    const at = `${name} ${t.id}`;
    check(at, !ids.has(t.id), "duplicate id");
    ids.add(t.id);

    check(at, t.name.trim().length > 0, "empty name");
    check(at, t.city.trim().length > 0, "empty city");
    check(at, /^[A-Z]{2}$/.test(t.country), `country not ISO alpha-2: "${t.country}"`);
    check(at, allowedSet.has(t.category), `unexpected category "${t.category}"`);
    check(at, t.week >= 1 && t.week <= 53, `week out of range: ${t.week}`);
    check(at, t.tours.length > 0, "no tours");

    const spec = points.categories[t.category];
    if (!spec) continue;

    check(at, t.band === spec.band, `band "${t.band}" disagrees with points.json`);

    const expected = roundsFor(spec);
    check(
      at,
      Object.keys(t.points).length === expected.length,
      `points table has ${Object.keys(t.points).length} rounds, expected ${expected.length}`,
    );
    check(at, t.points.winner === spec.winnerPoints, `winner points ${t.points.winner}`);
    check(at, t.prize!.winner === spec.winnerPrize, `winner prize ${t.prize!.winner}`);
    check(
      at,
      expected.every((r) => typeof t.points[r] === "number" && typeof t.prize![r] === "number"),
      "points/prize table missing a reachable round",
    );

    if (t.startDate) {
      check(at, t.startDate.startsWith("2026-"), `startDate outside 2026: ${t.startDate}`);
      check(at, (t.endDate ?? t.startDate) >= t.startDate, "endDate before startDate");
    }
  }

  const byCategory = file.tournaments.reduce<Record<string, number>>((acc, t) => {
    acc[t.category] = (acc[t.category] ?? 0) + 1;
    return acc;
  }, {});
  notes.push(
    `${name}: ${file.tournaments.length} tournaments · ` +
      Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${v}`)
        .join(", "),
  );
}

function main() {
  const points = validatePoints();

  for (const tour of ["men", "women"]) {
    validatePool(`players.${tour}.json`, "senior", 200);
    validatePool(`promises.${tour}.json`, "promise", 300);
  }

  validateCalendar("calendar.premier.json", points, ["p2", "p1", "major", "finals"], 24);
  validateCalendar("calendar.fip.json", points, ["bronze", "silver", "gold", "platinum"], 200);

  // §8 wants a full season's worth of playable weeks in every band.
  const premier = read<CalendarFile>("calendar.premier.json");
  const fip = read<CalendarFile>("calendar.fip.json");
  for (const band of ["developmental", "professional", "elite"]) {
    const weeks = new Set(
      [...premier.tournaments, ...fip.tournaments].filter((t) => t.band === band).map((t) => t.week),
    );
    check("calendar coverage", weeks.size >= 15, `band "${band}" only spans ${weeks.size} weeks`);
  }

  for (const note of notes) console.log(`  ${note}`);

  if (failures.length > 0) {
    console.error(`\n${failures.length} validation failure(s):`);
    for (const failure of failures.slice(0, 40)) console.error(`  - ${failure}`);
    if (failures.length > 40) console.error(`  ... and ${failures.length - 40} more`);
    process.exit(1);
  }

  console.log("\nAll Phase 0 data valid.");
}

main();
