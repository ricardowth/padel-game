/**
 * Seeded PRNG. Every random draw in the game routes through here so a whole
 * career is reproducible from one seed string (§9, §18).
 */

/** Hashes an arbitrary string into a 32-bit seed. */
export function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** Uniform pick from a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** Weighted pick; weights must be non-negative and not all zero. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T;
  /** Approximately normal draw, clamped to +/-3 sigma. */
  normal(mean: number, stdDev: number): number;
  /** In-place-safe shuffled copy. */
  shuffle<T>(items: readonly T[]): T[];
}

/** mulberry32 — small, fast, good enough for game simulation. */
export function createRng(seed: string | number): Rng {
  let state = (typeof seed === "string" ? hashSeed(seed) : seed >>> 0) || 1;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    chance: (p) => next() < p,

    pick(items) {
      if (items.length === 0) throw new Error("rng.pick: empty array");
      return items[Math.floor(next() * items.length)]!;
    },

    weighted(items, weights) {
      if (items.length === 0) throw new Error("rng.weighted: empty array");
      if (items.length !== weights.length) throw new Error("rng.weighted: length mismatch");

      const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
      if (total <= 0) throw new Error("rng.weighted: weights sum to zero");

      let roll = next() * total;
      for (let i = 0; i < items.length; i++) {
        roll -= Math.max(0, weights[i]!);
        if (roll <= 0) return items[i]!;
      }
      return items[items.length - 1]!;
    },

    // Sum of 3 uniforms: cheap, bounded, close enough to gaussian for our use.
    normal(mean, stdDev) {
      const u = (next() + next() + next()) / 3; // mean 0.5, sd 1/6
      return mean + (u - 0.5) * 6 * stdDev;
    },

    shuffle(items) {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
  };

  return rng;
}
