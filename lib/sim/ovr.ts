/**
 * Attribute -> OVR weighting per side (§4).
 *
 * The same raw attributes yield a different OVR depending on which side you
 * play: Drive players lean on remate/vibora/volea (finishers), Reves players on
 * bandeja/defensa/mental (playmakers who build the point). Playing off your
 * natural side is handled separately (§6) as a decaying penalty.
 */
import { ATTRIBUTE_KEYS, type AttributeKey, type Attributes, type Playstyle, type Side } from "../data/types";

export const OVR_MIN = 16;
export const OVR_MAX = 99;

export type WeightVector = Record<AttributeKey, number>;

/** Per-side weights. Each vector sums to 1. */
export const SIDE_WEIGHTS: Record<Side, WeightVector> = {
  drive: {
    remate: 0.18,
    volea: 0.15,
    bandeja: 0.07,
    vibora: 0.15,
    defensa: 0.08,
    pared: 0.1,
    velocidad: 0.13,
    mental: 0.14,
  },
  reves: {
    remate: 0.08,
    volea: 0.14,
    bandeja: 0.18,
    vibora: 0.07,
    defensa: 0.17,
    pared: 0.12,
    velocidad: 0.1,
    mental: 0.14,
  },
};

/** Shape deltas applied to a flat attribute profile before normalisation. */
export const PLAYSTYLE_BIAS: Record<Playstyle, WeightVector> = {
  power: {
    remate: 8,
    volea: 2,
    bandeja: -4,
    vibora: 6,
    defensa: -6,
    pared: -2,
    velocidad: 0,
    mental: -2,
  },
  playmaker: {
    remate: -6,
    volea: 3,
    bandeja: 8,
    vibora: -4,
    defensa: 2,
    pared: 0,
    velocidad: -3,
    mental: 6,
  },
  counter: {
    remate: -7,
    volea: -3,
    bandeja: -2,
    vibora: -5,
    defensa: 8,
    pared: 5,
    velocidad: 7,
    mental: 2,
  },
  allcourt: {
    remate: 0,
    volea: 1,
    bandeja: 1,
    vibora: 0,
    defensa: 1,
    pared: 1,
    velocidad: 0,
    mental: 1,
  },
};

/** Milder shape deltas from the side a player grew up on. */
export const SIDE_BIAS: Record<Side, WeightVector> = {
  drive: {
    remate: 3,
    volea: 1,
    bandeja: -3,
    vibora: 3,
    defensa: -3,
    pared: -1,
    velocidad: 1,
    mental: -1,
  },
  reves: {
    remate: -3,
    volea: 1,
    bandeja: 3,
    vibora: -3,
    defensa: 3,
    pared: 1,
    velocidad: -1,
    mental: 1,
  },
};

export const clampOvr = (value: number): number =>
  Math.max(OVR_MIN, Math.min(OVR_MAX, Math.round(value)));

/** Raw weighted score before clamping — useful when you need sub-16/99 headroom. */
export function rawOvr(attributes: Attributes, side: Side): number {
  const weights = SIDE_WEIGHTS[side];
  let total = 0;
  for (const key of ATTRIBUTE_KEYS) total += attributes[key] * weights[key];
  return total;
}

/** OVR(side) = round( sum(attribute_i * weight[side][i]) ), clamped 16..99. */
export function computeOvr(attributes: Attributes, side: Side): number {
  return clampOvr(rawOvr(attributes, side));
}

/**
 * Scales an attribute profile so its weighted OVR on `side` lands exactly on
 * `target`, preserving the profile's shape. Used by the data build to turn a
 * rank-derived target OVR into a plausible attribute spread.
 */
export function normaliseToOvr(attributes: Attributes, side: Side, target: number): Attributes {
  const current = rawOvr(attributes, side);
  const scale = current > 0 ? target / current : 1;

  const scaled = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) {
    scaled[key] = Math.max(OVR_MIN, Math.min(OVR_MAX, Math.round(attributes[key] * scale)));
  }

  // Rounding (and the 16/99 clamps) can drift the weighted sum off target by a
  // point or so. Nudge the attribute with the largest weight until it matches.
  const weights = SIDE_WEIGHTS[side];
  const byWeight = [...ATTRIBUTE_KEYS].sort((a, b) => weights[b] - weights[a]);

  for (let guard = 0; guard < 64; guard++) {
    const diff = target - rawOvr(scaled, side);
    if (Math.abs(diff) < 0.5) break;

    const step = diff > 0 ? 1 : -1;
    const key = byWeight.find((k) => {
      const nextValue = scaled[k] + step;
      return nextValue >= OVR_MIN && nextValue <= OVR_MAX;
    });
    if (!key) break;

    scaled[key] += step;
  }

  return scaled;
}
