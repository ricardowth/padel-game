/**
 * Retirements and intake (§11).
 *
 * A 19-season career outlives most of the real top 200, so the world has to keep
 * refreshing: veterans retire, the NextGen pool debuts on its staggered years,
 * and once that runs dry procedurally generated newcomers keep the ladder full.
 * Without this the late career plays against a frozen, aging tour.
 */
import type { Player, Playstyle, Side, Tour } from "../data/types";
import { ageOneSeason, retirementChance } from "./growth";
import { clampOvr, computeOvr, normaliseToOvr, PLAYSTYLE_BIAS, SIDE_BIAS } from "./ovr";
import { clonePlayer } from "./pool";
import type { Rng } from "./rng";
import { ATTRIBUTE_KEYS, type Attributes } from "../data/types";
import type { World } from "./types";

export interface RegenReport {
  retiredIds: string[];
  debutedIds: string[];
  generatedIds: string[];
}

/** Keeps the active pool near its starting size. */
const TARGET_POOL_SIZE = 200;

const PLAYSTYLES: Playstyle[] = ["power", "playmaker", "counter", "allcourt"];

/**
 * Newcomer names are recombined from the real pool's own first names and
 * surnames, grouped by country — that yields plausible, nationality-appropriate
 * names without shipping a separate name corpus, and it keeps a Spanish regen
 * Spanish. Exact matches against a real player are rejected.
 */
export interface NameBank {
  byCountry: Map<string, { first: string[]; last: string[] }>;
  countries: string[];
  weights: number[];
  taken: Set<string>;
}

export function buildNameBank(players: Iterable<Player>): NameBank {
  const byCountry = new Map<string, { first: string[]; last: string[] }>();
  const taken = new Set<string>();

  for (const player of players) {
    taken.add(player.name.toLowerCase());

    const parts = player.name.split(" ").filter(Boolean);
    if (parts.length < 2) continue;

    let entry = byCountry.get(player.country);
    if (!entry) {
      entry = { first: [], last: [] };
      byCountry.set(player.country, entry);
    }
    entry.first.push(parts[0]!);
    entry.last.push(parts.slice(1).join(" "));
  }

  // Weight by how many real players a country has, so regens mirror the real
  // distribution — padel stays Spanish and Argentine heavy.
  const countries = [...byCountry.keys()];
  const weights = countries.map((c) => byCountry.get(c)!.first.length);

  return { byCountry, countries, weights, taken };
}

function inventName(bank: NameBank, rng: Rng): { name: string; country: string } {
  for (let attempt = 0; attempt < 12; attempt++) {
    const country = rng.weighted(bank.countries, bank.weights);
    const entry = bank.byCountry.get(country)!;
    const name = `${rng.pick(entry.first)} ${rng.pick(entry.last)}`;

    if (!bank.taken.has(name.toLowerCase())) {
      bank.taken.add(name.toLowerCase());
      return { name, country };
    }
  }

  // Astronomically unlikely; keep the world moving rather than throw.
  const country = rng.weighted(bank.countries, bank.weights);
  const entry = bank.byCountry.get(country)!;
  return { name: `${rng.pick(entry.first)} ${rng.pick(entry.last)}`, country };
}

/** Builds a fresh 17-19 year old to replace a retiree. */
export function generateNewcomer(
  world: World,
  bank: NameBank,
  rng: Rng,
  year: number,
): Player {
  const { name, country } = inventName(bank, rng);
  const naturalSide: Side = rng.chance(0.5) ? "drive" : "reves";
  const playstyle = rng.pick(PLAYSTYLES);
  const age = rng.int(17, 19);

  const target = clampOvr(rng.range(42, 56));

  // Most newcomers are squad filler; a few are genuine future number ones.
  const ceiling = rng.chance(0.12)
    ? rng.range(86, 96)
    : rng.chance(0.35)
      ? rng.range(72, 86)
      : rng.range(60, 72);

  const shaped = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) {
    shaped[key] = target + SIDE_BIAS[naturalSide][key] + PLAYSTYLE_BIAS[playstyle][key] + rng.normal(0, 3);
  }
  const attributes = normaliseToOvr(shaped, naturalSide, target);

  world.regenCounter += 1;
  return {
    id: `REGEN-${world.tour === "men" ? "M" : "W"}-${year}-${world.regenCounter}`,
    name,
    country,
    tour: world.tour as Tour,
    naturalSide,
    currentSide: naturalSide,
    playstyle,
    attributes,
    potential: Math.max(target, clampOvr(ceiling)),
    age,
    ovr: computeOvr(attributes, naturalSide),
    isReal: false,
  };
}

export interface AdvanceWorldOptions {
  world: World;
  rng: Rng;
  year: number;
  bank: NameBank;
  /** Never retired out from under the player mid-career. */
  protectedIds?: Set<string>;
}

/**
 * Ages every NPC a season, retires who is done, and refills the pool from the
 * promise queue and then from regens.
 */
export function advanceWorld({
  world,
  rng,
  year,
  bank,
  protectedIds = new Set(),
}: AdvanceWorldOptions): RegenReport {
  const report: RegenReport = { retiredIds: [], debutedIds: [], generatedIds: [] };

  const survivors: string[] = [];
  for (const id of world.activeIds) {
    const player = world.players.get(id);
    if (!player) continue;

    ageOneSeason(player, { rng });

    const retires =
      !protectedIds.has(id) && rng.chance(retirementChance(player.age, player.ovr));

    if (retires) {
      world.retiredIds.add(id);
      world.points.delete(id);
      report.retiredIds.push(id);
    } else {
      survivors.push(id);
    }
  }
  world.activeIds = survivors;
  world.year = year;

  // Promises arrive on their debut year, already aged to match.
  const stillPending: Player[] = [];
  for (const promise of world.pending) {
    if ((promise.debutYear ?? year) > year) {
      stillPending.push(promise);
      continue;
    }

    const player = clonePlayer(promise);
    // Catch them up from the snapshot year to the year they actually arrive.
    while (player.age < 18 && player.age < 22) ageOneSeason(player, { rng });

    world.players.set(player.id, player);
    world.activeIds.push(player.id);
    report.debutedIds.push(player.id);
  }
  world.pending = stillPending;

  // Top the pool back up so draws never run thin late in a career.
  while (world.activeIds.length < TARGET_POOL_SIZE) {
    const newcomer = generateNewcomer(world, bank, rng, year);
    world.players.set(newcomer.id, newcomer);
    world.activeIds.push(newcomer.id);
    report.generatedIds.push(newcomer.id);
  }

  // ...and trim it back down when a big NextGen intake overshoots. A real tour
  // holds a roughly fixed number of ranked players: the ones at the bottom drop
  // off as the new wave arrives. Without this the ladder grows every season and
  // the player's rank number inflates for reasons they never see.
  if (world.activeIds.length > TARGET_POOL_SIZE) {
    const ordered = [...world.activeIds].sort(
      (a, b) => (world.points.get(a) ?? 0) - (world.points.get(b) ?? 0),
    );

    for (const id of ordered) {
      if (world.activeIds.length <= TARGET_POOL_SIZE) break;
      if (protectedIds.has(id)) continue;

      world.activeIds.splice(world.activeIds.indexOf(id), 1);
      world.points.delete(id);
      world.retiredIds.add(id);
      report.retiredIds.push(id);
    }
  }

  return report;
}
