/**
 * Aging, potential and decline (§4, §16).
 *
 * OVR rises fast from 16 to 24, flattens across the 25-30 peak, and falls after
 * 31 — unless a strong `mental` softens the drop, which is what makes "veteran
 * mental offsets physical decline" a real mechanic rather than flavour text.
 */
import { ATTRIBUTE_KEYS, type AttributeKey, type Player } from "../data/types";
import { clampOvr, computeOvr, normaliseToOvr, OVR_MAX, OVR_MIN } from "./ovr";
import type { Rng } from "./rng";

export const RETIREMENT_AGE = 35;

/** How much of the remaining gap to potential is closed in one season. */
function growthRate(age: number): number {
  if (age <= 20) return 0.3;
  if (age <= 24) return 0.22;
  if (age <= 27) return 0.12;
  if (age <= 30) return 0.05;
  return 0;
}

/** Raw physical decline once past the peak, before mental offsets it. */
function declineFor(age: number): number {
  if (age <= 30) return 0;
  return (age - 30) * 0.9;
}

/**
 * Composure buys time: a 90-mental veteran gives back roughly two OVR a season
 * less than a 60-mental one.
 */
function veteranOffset(mental: number): number {
  return Math.max(0, Math.min(2.5, (mental - 68) / 10));
}

/**
 * Growth favours the legs and the big shots; decline takes them back first
 * while `mental` keeps creeping up. These are *shape* weights — the profile is
 * renormalised afterwards, so they decide where change lands, not how much.
 */
const GROWTH_SHAPE: Record<AttributeKey, number> = {
  remate: 1.15,
  volea: 1,
  bandeja: 1,
  vibora: 1.1,
  defensa: 0.95,
  pared: 1,
  velocidad: 1.2,
  mental: 0.8,
};

const DECLINE_SHAPE: Record<AttributeKey, number> = {
  remate: 1.3,
  volea: 0.9,
  bandeja: 0.7,
  vibora: 1.2,
  defensa: 0.9,
  pared: 0.8,
  velocidad: 1.6,
  // Experience still accrues while the body goes.
  mental: -0.5,
};

export interface GrowthOptions {
  /** Multiplies positive growth — a coach (§10). */
  coachBonus?: number;
  /** Extra OVR delta from decisions taken this season. */
  bonus?: number;
  rng?: Rng;
}

/**
 * Advances a player one season: ages them, moves their OVR, and reshapes the
 * attribute spread. Mutates `player` — worlds own their copies.
 */
export function ageOneSeason(player: Player, options: GrowthOptions = {}): number {
  const { coachBonus = 1, bonus = 0, rng } = options;

  player.age += 1;

  const current = computeOvr(player.attributes, player.currentSide);
  const gap = player.potential - current;

  let delta = 0;
  if (gap > 0) delta += gap * growthRate(player.age) * coachBonus;
  delta -= declineFor(player.age);
  if (player.age > 30) delta += veteranOffset(player.attributes.mental);
  delta += bonus;

  // A little season-to-season noise so identical players diverge (§9).
  if (rng) delta += rng.normal(0, 0.5);

  // Growth never overshoots potential; decline is uncapped below it.
  const target = clampOvr(
    delta > 0 ? Math.min(player.potential, current + delta) : current + delta,
  );
  if (target === current) return 0;

  const shape = delta > 0 ? GROWTH_SHAPE : DECLINE_SHAPE;
  const magnitude = target - current;

  const shaped = { ...player.attributes };
  for (const key of ATTRIBUTE_KEYS) {
    shaped[key] = Math.max(
      OVR_MIN,
      Math.min(OVR_MAX, shaped[key] + magnitude * shape[key]),
    );
  }

  player.attributes = normaliseToOvr(shaped, player.currentSide, target);
  player.ovr = computeOvr(player.attributes, player.currentSide);

  return player.ovr - current;
}

/**
 * Applies a one-off OVR change (training, injury damage, a technique tweak)
 * without aging the player.
 */
export function nudgeOvr(player: Player, delta: number): number {
  const current = computeOvr(player.attributes, player.currentSide);
  const target = clampOvr(current + delta);
  if (target === current) return 0;

  const shape = delta > 0 ? GROWTH_SHAPE : DECLINE_SHAPE;
  const shaped = { ...player.attributes };
  for (const key of ATTRIBUTE_KEYS) {
    shaped[key] = Math.max(
      OVR_MIN,
      Math.min(OVR_MAX, shaped[key] + (target - current) * shape[key]),
    );
  }

  player.attributes = normaliseToOvr(shaped, player.currentSide, target);
  player.ovr = computeOvr(player.attributes, player.currentSide);
  // Growing past your ceiling raises the ceiling — training is how potential moves.
  player.potential = Math.max(player.potential, player.ovr);

  return player.ovr - current;
}

/** Raises a single attribute (a coach's technique tweak) and re-derives OVR. */
export function nudgeAttribute(player: Player, key: AttributeKey, delta: number): number {
  const before = player.ovr;
  player.attributes[key] = Math.max(
    OVR_MIN,
    Math.min(OVR_MAX, Math.round(player.attributes[key] + delta)),
  );
  player.ovr = computeOvr(player.attributes, player.currentSide);
  player.potential = Math.max(player.potential, player.ovr);
  return player.ovr - before;
}

/**
 * Probability an NPC retires at the end of a season. Padel's ranked veterans do
 * play into their 40s, so this stays gentle until the late 30s.
 */
export function retirementChance(age: number, ovr: number): number {
  if (age < 33) return 0;
  const byAge = (age - 32) * 0.16;
  // Still competitive? Hang on longer.
  const byLevel = ovr >= 82 ? -0.12 : ovr >= 72 ? -0.05 : 0.05;
  return Math.max(0, Math.min(1, byAge + byLevel));
}
