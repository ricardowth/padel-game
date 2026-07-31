import { describe, expect, it } from "vitest";

import { createRng, hashSeed, randomSeed } from "./rng";

describe("createRng", () => {
  it("is deterministic for a given seed", () => {
    const a = Array.from({ length: 50 }, () => createRng("career-seed").next());
    const b = Array.from({ length: 50 }, () => createRng("career-seed").next());
    expect(a).toEqual(b);
  });

  it("produces a different stream for a different seed", () => {
    const a = createRng("seed-a");
    const b = createRng("seed-b");
    const drawA = Array.from({ length: 20 }, () => a.next());
    const drawB = Array.from({ length: 20 }, () => b.next());
    expect(drawA).not.toEqual(drawB);
  });

  it("advances its state across calls", () => {
    const rng = createRng("advance");
    const draws = new Set(Array.from({ length: 200 }, () => rng.next()));
    expect(draws.size).toBeGreaterThan(190);
  });

  it("keeps next() inside [0, 1)", () => {
    const rng = createRng("bounds");
    for (let i = 0; i < 5000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("keeps int() inside the inclusive range and reaches both ends", () => {
    const rng = createRng("ints");
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const value = rng.int(3, 7);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(7);
      seen.add(value);
    }
    expect(seen).toEqual(new Set([3, 4, 5, 6, 7]));
  });

  it("respects weights", () => {
    const rng = createRng("weights");
    const counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 10000; i++) {
      counts[rng.weighted(["a", "b", "c"] as const, [0.7, 0.3, 0])]++;
    }
    expect(counts.c).toBe(0);
    expect(counts.a / 10000).toBeCloseTo(0.7, 1);
    expect(counts.b / 10000).toBeCloseTo(0.3, 1);
  });

  it("rejects degenerate weighted() input", () => {
    const rng = createRng("bad-weights");
    expect(() => rng.weighted([], [])).toThrow();
    expect(() => rng.weighted(["a"], [0])).toThrow();
    expect(() => rng.weighted(["a", "b"], [1])).toThrow();
  });

  it("draws normal() around the mean without runaway tails", () => {
    const rng = createRng("normal");
    const draws = Array.from({ length: 20000 }, () => rng.normal(50, 5));
    const mean = draws.reduce((sum, v) => sum + v, 0) / draws.length;
    expect(mean).toBeCloseTo(50, 0);
    expect(Math.min(...draws)).toBeGreaterThan(50 - 5 * 3.1);
    expect(Math.max(...draws)).toBeLessThan(50 + 5 * 3.1);
  });

  it("shuffles without mutating or dropping elements", () => {
    const source = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = createRng("shuffle").shuffle(source);
    expect(source).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(source);
  });

  it("accepts a numeric seed and matches its hashed string form", () => {
    const seed = hashSeed("numeric");
    expect(createRng(seed).next()).toBe(createRng("numeric").next());
  });
});

describe("randomSeed", () => {
  it("produces a readable, URL-safe token", () => {
    for (let i = 0; i < 200; i++) {
      expect(randomSeed()).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    }
  });

  it("avoids look-alike characters so a shared seed can be typed back in", () => {
    const sample = Array.from({ length: 400 }, () => randomSeed()).join("");
    expect(sample).not.toMatch(/[01loi]/);
  });

  it("is different every time — a new career must not be predictable", () => {
    const seeds = new Set(Array.from({ length: 2000 }, () => randomSeed()));
    expect(seeds.size).toBe(2000);
  });

  it("still drives a reproducible stream once generated", () => {
    const seed = randomSeed();
    const a = Array.from({ length: 20 }, () => createRng(seed).next());
    const b = Array.from({ length: 20 }, () => createRng(seed).next());
    expect(a).toEqual(b);
  });

  it("honours a requested shape", () => {
    expect(randomSeed(2, 3)).toMatch(/^[a-z2-9]{3}-[a-z2-9]{3}$/);
    expect(randomSeed(1, 8)).toMatch(/^[a-z2-9]{8}$/);
  });
});
