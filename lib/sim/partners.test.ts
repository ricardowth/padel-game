import { describe, expect, it } from "vitest";

import { ATTRIBUTE_KEYS, type Attributes, type Player } from "../data/types";
import { computeOvr, normaliseToOvr } from "./ovr";
import {
  bandForRank,
  beginSideSwitch,
  canEnterBand,
  decaySidePenalty,
  SIDE_SWITCH_DECAY_SEASONS,
  SIDE_SWITCH_FLOOR,
  teamStrength,
  updateChemistry,
} from "./partners";

function player(ovr: number, side: "drive" | "reves" = "reves"): Player {
  const flat = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) flat[key] = ovr;
  const attributes = normaliseToOvr(flat, side, ovr);
  return {
    id: `P${ovr}${side}`,
    name: "Partner",
    country: "ES",
    tour: "men",
    naturalSide: side,
    currentSide: side,
    playstyle: "allcourt",
    attributes,
    potential: ovr,
    age: 25,
    ovr: computeOvr(attributes, side),
    isReal: true,
  };
}

const base = {
  ownOvr: 75,
  ownSide: "drive" as const,
  chemistry: 50,
  form: 0,
  fatigue: 0,
};

describe("teamStrength", () => {
  it("averages the pair", () => {
    const s = teamStrength({ ...base, partner: player(65) });
    expect(s.base).toBe(70);
  });

  it("rewards covering complementary sides and punishes duplicates", () => {
    const complementary = teamStrength({ ...base, partner: player(75, "reves") });
    const duplicate = teamStrength({ ...base, partner: player(75, "drive") });
    expect(complementary.sideBalance).toBeGreaterThan(duplicate.sideBalance);
    expect(complementary.total).toBeGreaterThan(duplicate.total);
  });

  it("lets chemistry outweigh a small gap in partner quality", () => {
    // §16: loyalty should sometimes beat raw level.
    const loyal = teamStrength({ ...base, partner: player(72, "reves"), chemistry: 100 });
    const fresh = teamStrength({ ...base, partner: player(75, "reves"), chemistry: 40 });
    expect(loyal.total).toBeGreaterThan(fresh.total);
  });

  it("is dragged down by fatigue and lifted by form", () => {
    const tired = teamStrength({ ...base, partner: player(75, "reves"), fatigue: 100 });
    const fresh = teamStrength({ ...base, partner: player(75, "reves"), fatigue: 0 });
    expect(tired.total).toBeLessThan(fresh.total);

    const hot = teamStrength({ ...base, partner: player(75, "reves"), form: 100 });
    expect(hot.total).toBeGreaterThan(fresh.total);
  });

  it("handles having no partner at all", () => {
    expect(() => teamStrength({ ...base, partner: null })).not.toThrow();
  });
});

describe("side switch penalty (§6)", () => {
  const subject = player(80, "drive");

  it("starts as a real hit", () => {
    const penalty = beginSideSwitch(subject);
    expect(penalty.current).toBeGreaterThanOrEqual(6);
    expect(penalty.seasonsLeft).toBe(SIDE_SWITCH_DECAY_SEASONS);
  });

  it("decays toward the floor over about three seasons", () => {
    let penalty = beginSideSwitch(subject);
    const start = penalty.current;

    for (let i = 0; i < SIDE_SWITCH_DECAY_SEASONS; i++) {
      penalty = decaySidePenalty(penalty)!;
    }

    expect(penalty.current).toBeCloseTo(SIDE_SWITCH_FLOOR, 5);
    expect(penalty.current).toBeLessThan(start);
    expect(penalty.seasonsLeft).toBe(0);
  });

  it("never fully clears — switching costs something forever", () => {
    let penalty = beginSideSwitch(subject);
    for (let i = 0; i < 20; i++) penalty = decaySidePenalty(penalty)!;
    expect(penalty.current).toBeGreaterThanOrEqual(SIDE_SWITCH_FLOOR);
  });

  it("costs a power player more than an all-court one", () => {
    const power = beginSideSwitch({ ...subject, playstyle: "power" });
    const allcourt = beginSideSwitch({ ...subject, playstyle: "allcourt" });
    expect(power.current).toBeGreaterThan(allcourt.current);
  });

  it("tolerates a null penalty", () => {
    expect(decaySidePenalty(null)).toBeNull();
  });
});

describe("updateChemistry", () => {
  it("builds with a season together", () => {
    expect(updateChemistry(40, 0, 0, 0.55)).toBeGreaterThan(40);
  });

  it("builds faster when the pair wins", () => {
    expect(updateChemistry(40, 4, 6, 0.7)).toBeGreaterThan(updateChemistry(40, 0, 0, 0.7));
  });

  it("erodes after a bad season", () => {
    expect(updateChemistry(60, 0, 0, 0.3)).toBeLessThan(60);
  });

  it("stays within 0..100", () => {
    expect(updateChemistry(98, 10, 10, 0.9)).toBeLessThanOrEqual(100);
    expect(updateChemistry(2, 0, 0, 0.1)).toBeGreaterThanOrEqual(0);
  });
});

describe("band gating (§7)", () => {
  it("maps rank to a circuit tier", () => {
    expect(bandForRank(5)).toBe("elite");
    expect(bandForRank(80)).toBe("professional");
    expect(bandForRank(300)).toBe("developmental");
  });

  it("gates entry by ranking", () => {
    expect(canEnterBand("elite", 20)).toBe(true);
    expect(canEnterBand("elite", 200)).toBe(false);
    expect(canEnterBand("developmental", 5000)).toBe(true);
  });

  it("lets a wildcard bypass the gate", () => {
    expect(canEnterBand("elite", 500, true)).toBe(true);
  });
});
