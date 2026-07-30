import { describe, expect, it } from "vitest";

import { ATTRIBUTE_KEYS, type Attributes, type Player } from "../data/types";
import { ageOneSeason, nudgeAttribute, nudgeOvr, retirementChance } from "./growth";
import { computeOvr, normaliseToOvr } from "./ovr";
import { createRng } from "./rng";

function makePlayer(overrides: Partial<Player> = {}): Player {
  const flat = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) flat[key] = 60;
  const attributes = normaliseToOvr(flat, "drive", overrides.ovr ?? 60);

  return {
    id: "T",
    name: "Test Player",
    country: "ES",
    tour: "men",
    naturalSide: "drive",
    currentSide: "drive",
    playstyle: "allcourt",
    attributes,
    potential: 85,
    age: 20,
    ovr: computeOvr(attributes, "drive"),
    isReal: false,
    ...overrides,
  };
}

describe("ageOneSeason", () => {
  it("grows a young player toward their potential", () => {
    const player = makePlayer({ age: 18, potential: 88 });
    const before = player.ovr;
    ageOneSeason(player);
    expect(player.age).toBe(19);
    expect(player.ovr).toBeGreaterThan(before);
  });

  it("never grows past potential", () => {
    const player = makePlayer({ age: 18, potential: 64 });
    for (let i = 0; i < 8; i++) ageOneSeason(player);
    expect(player.ovr).toBeLessThanOrEqual(64);
  });

  it("declines after the peak", () => {
    const player = makePlayer({ age: 33, potential: 60 });
    const before = player.ovr;
    ageOneSeason(player);
    expect(player.ovr).toBeLessThan(before);
  });

  it("lets veteran mental soften the decline", () => {
    const composed = makePlayer({ age: 34, potential: 60 });
    const fragile = makePlayer({ age: 34, potential: 60 });
    composed.attributes.mental = 95;
    fragile.attributes.mental = 45;

    const composedDelta = ageOneSeason(composed);
    const fragileDelta = ageOneSeason(fragile);
    expect(composedDelta).toBeGreaterThan(fragileDelta);
  });

  it("keeps ovr consistent with attributes throughout a career", () => {
    const rng = createRng("growth");
    const player = makePlayer({ age: 16, potential: 90 });
    for (let age = 16; age < 35; age++) {
      ageOneSeason(player, { rng });
      expect(player.ovr).toBe(computeOvr(player.attributes, player.currentSide));
    }
  });

  it("produces a peak somewhere in the 25-31 window", () => {
    const player = makePlayer({ age: 16, potential: 90 });
    let peakAge = 16;
    let peak = player.ovr;
    for (let age = 16; age < 36; age++) {
      ageOneSeason(player);
      if (player.ovr > peak) {
        peak = player.ovr;
        peakAge = player.age;
      }
    }
    expect(peakAge).toBeGreaterThanOrEqual(24);
    expect(peakAge).toBeLessThanOrEqual(32);
  });
});

describe("nudgeOvr / nudgeAttribute", () => {
  it("moves ovr by roughly the requested amount", () => {
    const player = makePlayer({ ovr: 70, potential: 90 });
    const before = player.ovr;
    nudgeOvr(player, 3);
    expect(player.ovr).toBe(before + 3);
  });

  it("raises potential when training pushes past the old ceiling", () => {
    const player = makePlayer({ ovr: 70, potential: 70 });
    nudgeOvr(player, 4);
    expect(player.potential).toBeGreaterThanOrEqual(player.ovr);
  });

  it("raises a single attribute and re-derives ovr", () => {
    const player = makePlayer({ ovr: 70, potential: 90 });
    const before = player.attributes.remate;
    nudgeAttribute(player, "remate", 5);
    expect(player.attributes.remate).toBe(before + 5);
    expect(player.ovr).toBe(computeOvr(player.attributes, player.currentSide));
  });
});

describe("retirementChance", () => {
  it("is zero for players in their prime", () => {
    expect(retirementChance(24, 80)).toBe(0);
    expect(retirementChance(32, 80)).toBe(0);
  });

  it("rises with age", () => {
    expect(retirementChance(38, 65)).toBeGreaterThan(retirementChance(34, 65));
  });

  it("lets the still-competitive hang on longer", () => {
    expect(retirementChance(36, 88)).toBeLessThan(retirementChance(36, 65));
  });

  it("stays a probability", () => {
    for (let age = 30; age <= 50; age++) {
      for (const ovr of [60, 75, 90]) {
        const p = retirementChance(age, ovr);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });
});
