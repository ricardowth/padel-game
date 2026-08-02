import { describe, expect, it } from "vitest";

import type { Band } from "../data/types";
import { ALL_EVENTS } from "./events";
import type { EventContext, EventDefinition } from "./types";

const definition = (id: string): EventDefinition => {
  const found = ALL_EVENTS.find((e) => e.id === id);
  if (!found) throw new Error(`no event ${id}`);
  return found;
};

/** A mid-career context; every gate this file exercises is overridden per test. */
function ctx(over: Partial<EventContext["career"]> = {}): EventContext {
  return {
    career: {
      age: 26,
      ovr: 80,
      band: "elite" as Band,
      rank: 30,
      season: 8,
      year: 2033,
      form: 0,
      fatigue: 30,
      morale: 60,
      chemistry: 55,
      earnings: 500_000,
      injured: false,
      partnerId: "P1",
      side: "drive",
      naturalSide: "drive",
      hasCoach: false,
      hasSponsor: false,
      firedEventIds: [],
      seasonTitles: 1,
      rankDelta: 0,
      qualifyingAttempts: 0,
      qualifyingFailures: 0,
      seasonNet: 100_000,
      poorDecisions: 0,
      ...over,
    },
    world: {} as EventContext["world"],
    nameOf: () => "Someone",
  };
}

const isEligible = (id: string, career: Partial<EventContext["career"]>) => {
  const event = definition(id);
  return event.eligible ? event.eligible(ctx(career)) : true;
};

const optionIds = (id: string, career: Partial<EventContext["career"]>) =>
  definition(id)
    .build(ctx(career))
    .options.map((o) => o.id);

/**
 * §7: a Premier place is earned entry, not a ranking that quietly slips. The
 * only thing that can take it back is the qualifying draw.
 */
describe("leaving Premier", () => {
  const failing = { qualifyingAttempts: 8, qualifyingFailures: 5 };

  it("is offered when the season was spent losing in the previa", () => {
    expect(isEligible("drop_down", { band: "elite", ...failing })).toBe(true);
    expect(optionIds("switch_band", { band: "elite", ...failing })).toContain("drop_pro");
  });

  it("is not offered to a Premier player who is making main draws", () => {
    expect(isEligible("drop_down", { band: "elite", seasonNet: -250_000 })).toBe(false);
    expect(optionIds("switch_band", { band: "elite", seasonNet: -250_000 })).not.toContain(
      "drop_pro",
    );
  });

  it("is not offered for a bad season alone", () => {
    const slumped = { band: "elite" as Band, rank: 58, rankDelta: 40, morale: 20, form: -30 };
    expect(isEligible("drop_down", slumped)).toBe(false);
    expect(optionIds("switch_band", slumped)).not.toContain("drop_pro");
  });

  it("ignores a previa record too short to mean anything", () => {
    // Two failed qualifiers is a bad fortnight, not a level you cannot hold.
    expect(
      isEligible("drop_down", {
        band: "elite",
        qualifyingAttempts: 2,
        qualifyingFailures: 2,
        seasonNet: -50_000,
      }),
    ).toBe(false);
  });

  it("still lets the money end a season below Premier", () => {
    // Down there the travel bill really is what ends careers, so it still counts.
    expect(isEligible("drop_down", { band: "professional", seasonNet: -40_000 })).toBe(true);
  });

  it("never drops anyone out of the bottom band", () => {
    expect(isEligible("drop_down", { band: "developmental", seasonNet: -40_000 })).toBe(false);
  });
});
