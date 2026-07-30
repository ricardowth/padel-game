import { describe, expect, it } from "vitest";

import { ATTRIBUTE_KEYS, type Attributes } from "../data/types";
import { SIDE_WEIGHTS, computeOvr, normaliseToOvr, rawOvr } from "./ovr";

const flat = (value: number): Attributes => {
  const attributes = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) attributes[key] = value;
  return attributes;
};

describe("side weights", () => {
  it("sums to 1 on each side", () => {
    for (const side of ["drive", "reves"] as const) {
      const total = ATTRIBUTE_KEYS.reduce((sum, k) => sum + SIDE_WEIGHTS[side][k], 0);
      expect(total).toBeCloseTo(1, 10);
    }
  });

  it("leans drive on the finishing shots and reves on the building ones", () => {
    expect(SIDE_WEIGHTS.drive.remate).toBeGreaterThan(SIDE_WEIGHTS.reves.remate);
    expect(SIDE_WEIGHTS.drive.vibora).toBeGreaterThan(SIDE_WEIGHTS.reves.vibora);
    expect(SIDE_WEIGHTS.reves.bandeja).toBeGreaterThan(SIDE_WEIGHTS.drive.bandeja);
    expect(SIDE_WEIGHTS.reves.defensa).toBeGreaterThan(SIDE_WEIGHTS.drive.defensa);
    // mental and volea matter to both sides (§4).
    expect(SIDE_WEIGHTS.drive.mental).toBe(SIDE_WEIGHTS.reves.mental);
  });
});

describe("computeOvr", () => {
  it("returns the flat value for a flat profile, on either side", () => {
    expect(computeOvr(flat(70), "drive")).toBe(70);
    expect(computeOvr(flat(70), "reves")).toBe(70);
  });

  it("clamps to 16..99", () => {
    expect(computeOvr(flat(5), "drive")).toBe(16);
    expect(computeOvr(flat(150), "reves")).toBe(99);
  });

  it("rates the same attributes differently depending on the side played", () => {
    // A finisher's profile: big overheads, thin defence.
    const finisher: Attributes = {
      ...flat(70),
      remate: 92,
      vibora: 90,
      defensa: 52,
      bandeja: 55,
    };
    expect(computeOvr(finisher, "drive")).toBeGreaterThan(computeOvr(finisher, "reves"));

    const builder: Attributes = {
      ...flat(70),
      bandeja: 92,
      defensa: 90,
      remate: 52,
      vibora: 55,
    };
    expect(computeOvr(builder, "reves")).toBeGreaterThan(computeOvr(builder, "drive"));
  });
});

describe("normaliseToOvr", () => {
  it("lands exactly on the target across the whole rating range", () => {
    for (const side of ["drive", "reves"] as const) {
      for (let target = 20; target <= 96; target++) {
        const shaped: Attributes = {
          ...flat(target),
          remate: target + 9,
          defensa: target - 7,
          mental: target + 4,
          velocidad: target - 5,
        };
        expect(computeOvr(normaliseToOvr(shaped, side, target), side)).toBe(target);
      }
    }
  });

  it("preserves the shape of the profile", () => {
    const shaped: Attributes = { ...flat(60), remate: 80, defensa: 40 };
    const result = normaliseToOvr(shaped, "drive", 75);
    expect(result.remate).toBeGreaterThan(result.volea);
    expect(result.defensa).toBeLessThan(result.volea);
  });

  it("keeps every attribute inside 16..99", () => {
    const extreme: Attributes = { ...flat(90), remate: 99, defensa: 30 };
    for (const target of [16, 40, 99]) {
      const result = normaliseToOvr(extreme, "reves", target);
      for (const key of ATTRIBUTE_KEYS) {
        expect(result[key]).toBeGreaterThanOrEqual(16);
        expect(result[key]).toBeLessThanOrEqual(99);
      }
    }
  });

  it("is a no-op for a profile already on target", () => {
    const onTarget = normaliseToOvr(flat(70), "drive", 70);
    expect(rawOvr(onTarget, "drive")).toBeCloseTo(70, 5);
  });
});
