/**
 * The living world: who is on tour, who they play with, and how many ranking
 * points they are carrying (§11).
 *
 * Rival careers are *not* simulated match by match — that would cost 200x the
 * work for detail nobody sees. Instead each NPC pair's season points are drawn
 * from their team strength, which reproduces a plausible ladder (the top pair
 * lands near 20,000, #200 near 200) and lets promises rise and veterans fade
 * without a second engine. The player's own points always come from real
 * simulated results, and they are inserted into that ladder.
 */
import type { Player, Tour } from "../data/types";
import type { TourData } from "../data/load";
import { computeOvr } from "./ovr";
import type { Rng } from "./rng";
import type { Pair, World } from "./types";

/**
 * Calibration for team strength -> season ranking points. Anchored on the real
 * snapshot: the #1 pair held ~21,000 points and #200 a little over 200.
 *
 * Note this is keyed on *pair* strength, not a single player's OVR. Pair
 * strength runs a few points above the members' mean (side balance and
 * chemistry both add), so the top pair sits near 100 rather than 96. Calibrating
 * against individual OVR instead put the #1 pair on ~30,000 points — more than a
 * flawless elite season can physically score (5 Majors + 10 P1s + 9 P2s + the
 * Finals is 26,000), which made the top of the ladder unreachable by
 * construction. Keep the ceiling here below that number.
 */
const POINTS_AT_FLOOR = 200;
const STRENGTH_FLOOR = 65;
const POINTS_GROWTH = 0.13297; // ln(21000 / 200) / (100 - 65)

export function pointsForStrength(strength: number): number {
  return POINTS_AT_FLOOR * Math.exp(POINTS_GROWTH * (strength - STRENGTH_FLOOR));
}

/** A player's own contribution, before team effects. */
export function effectiveOvr(player: Player): number {
  return computeOvr(player.attributes, player.currentSide);
}

/** Mean OVR of a pair, plus the small lift that comes from covering both sides. */
export function pairStrength(pair: Pair, world: World): number {
  const drive = world.players.get(pair.driveId);
  const reves = world.players.get(pair.revesId);
  if (!drive || !reves) return STRENGTH_FLOOR;

  const base = (effectiveOvr(drive) + effectiveOvr(reves)) / 2;
  const chemistry = ((pair.chemistry - 50) / 50) * 3;

  // Someone is playing off their natural side if both prefer the same one.
  const offSide =
    drive.naturalSide === reves.naturalSide ? -4 : 2;

  return base + chemistry + offSide;
}

/**
 * Pairs the active pool up, best players first, preferring complementary sides.
 * Real tours pair by level, so walking the ranked list and matching each player
 * with the nearest compatible free partner gets very close.
 */
export function repair(world: World, rng: Rng, exclude: Set<string> = new Set()): void {
  world.pairOf.clear();

  const available = world.activeIds.filter((id) => !exclude.has(id));
  const taken = new Set<string>();

  for (let i = 0; i < available.length; i++) {
    const id = available[i]!;
    if (taken.has(id)) continue;

    const player = world.players.get(id);
    if (!player) continue;

    // Look ahead a short window for someone who owns the other side.
    let partnerId: string | undefined;
    for (let j = i + 1; j < Math.min(i + 12, available.length); j++) {
      const candidateId = available[j]!;
      if (taken.has(candidateId)) continue;
      const candidate = world.players.get(candidateId);
      if (!candidate) continue;
      if (candidate.naturalSide !== player.naturalSide) {
        partnerId = candidateId;
        break;
      }
    }

    // No complementary partner nearby — take the next free player and eat the
    // off-side penalty, exactly as happens on tour.
    partnerId ??= available.slice(i + 1).find((candidateId) => !taken.has(candidateId));
    if (!partnerId) break;

    taken.add(id);
    taken.add(partnerId);

    const partner = world.players.get(partnerId)!;
    const pair = makePair(player, partner, rng.int(35, 85));
    world.pairOf.set(id, pair);
    world.pairOf.set(partnerId, pair);
  }
}

/** Builds a pair, putting each player on the side they own where possible. */
export function makePair(a: Player, b: Player, chemistry: number): Pair {
  // When both prefer the same side, the lower-rated one shifts across.
  if (a.naturalSide === b.naturalSide) {
    const [driveSide, revesSide] =
      effectiveOvr(a) >= effectiveOvr(b) ? [a, b] : [b, a];
    return a.naturalSide === "drive"
      ? { driveId: driveSide.id, revesId: revesSide.id, chemistry }
      : { driveId: revesSide.id, revesId: driveSide.id, chemistry };
  }

  const drive = a.naturalSide === "drive" ? a : b;
  const reves = a.naturalSide === "reves" ? a : b;
  return { driveId: drive.id, revesId: reves.id, chemistry };
}

/** Recomputes every NPC's season points and re-sorts the ladder. */
export function rescoreLadder(world: World, rng: Rng): void {
  world.points.clear();

  for (const id of world.activeIds) {
    const pair = world.pairOf.get(id);
    const player = world.players.get(id);
    if (!player) continue;

    const strength = pair ? pairStrength(pair, world) : effectiveOvr(player) - 4;

    // Season variance: a pair's actual haul swings either side of expectation.
    const noise = rng.range(0.78, 1.28);
    world.points.set(id, Math.max(0, Math.round(pointsForStrength(strength) * noise)));
  }

  sortLadder(world);
}

export function sortLadder(world: World): void {
  world.activeIds.sort((a, b) => {
    const delta = (world.points.get(b) ?? 0) - (world.points.get(a) ?? 0);
    return delta !== 0 ? delta : a.localeCompare(b);
  });
}

/** Where a given points total would sit on the current ladder. */
export function rankForPoints(world: World, points: number, excludeId?: string): number {
  let ahead = 0;
  for (const id of world.activeIds) {
    if (id === excludeId) continue;
    if ((world.points.get(id) ?? 0) > points) ahead++;
  }
  return ahead + 1;
}

/** Deep-copies a player so the world never mutates the loaded JSON. */
export const clonePlayer = (player: Player): Player => ({
  ...player,
  attributes: { ...player.attributes },
});

export interface CreateWorldOptions {
  data: TourData;
  rng: Rng;
  year: number;
  /** Excluded from NPC pairing — this is the player's own partner slot. */
  reservedIds?: Set<string>;
}

export function createWorld({ data, rng, year }: CreateWorldOptions): World {
  const players = new Map<string, Player>();

  for (const player of data.seniors.players) players.set(player.id, clonePlayer(player));

  // Promises sit out of the active pool until their debut year comes round.
  const pending: Player[] = [];
  for (const promise of data.promises.players) {
    const copy = clonePlayer(promise);
    if ((copy.debutYear ?? year) <= year) {
      players.set(copy.id, copy);
    } else {
      pending.push(copy);
    }
  }

  const world: World = {
    tour: data.tour as Tour,
    year,
    players,
    activeIds: [...players.keys()],
    points: new Map(),
    pairOf: new Map(),
    pending,
    retiredIds: new Set(),
    regenCounter: 0,
  };

  // Seed the ladder from the real ranking before any simulation runs.
  for (const player of players.values()) {
    world.points.set(player.id, player.source?.fipPoints ?? pointsForStrength(player.ovr));
  }
  sortLadder(world);
  repair(world, rng);

  return world;
}

/** Active players whose OVR sits inside a window — used to build draws. */
export function playersNear(world: World, ovr: number, spread: number): Player[] {
  const out: Player[] = [];
  for (const id of world.activeIds) {
    const player = world.players.get(id);
    if (player && Math.abs(effectiveOvr(player) - ovr) <= spread) out.push(player);
  }
  return out;
}
