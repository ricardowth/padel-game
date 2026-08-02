import { describe, expect, it } from "vitest";

import { ROUND_INDEX, WINNER_ROUND_INDEX } from "../data/points";
import type { Category } from "../data/types";
import type { TournamentOutcome } from "../sim/types";
import { MIN_DWELL_MS, SEASON_BUDGET_MS, dwellWeight, revealDelays } from "./pacing";

const result = (over: Partial<TournamentOutcome> = {}): TournamentOutcome => ({
  tournamentId: "t",
  tournamentName: "Some Open",
  category: "gold",
  band: "professional",
  week: 1,
  year: 2030,
  partnerId: "P",
  roundReached: ROUND_INDEX.r32,
  matchesWon: 0,
  points: 0,
  prize: 0,
  cost: 900,
  hadToQualify: false,
  qualified: true,
  won: false,
  reachedFinal: false,
  ...over,
});

const title = (category: Category) =>
  result({ category, won: true, reachedFinal: true, roundReached: WINNER_ROUND_INDEX });

const earlyExit = () => result({ roundReached: ROUND_INDEX.r32 });
const qualifyingExit = () => result({ qualified: false, hadToQualify: true });

describe("dwellWeight", () => {
  it("lingers longest on the biggest titles", () => {
    expect(dwellWeight(title("major"))).toBeGreaterThan(dwellWeight(title("platinum")));
    expect(dwellWeight(title("platinum"))).toBeGreaterThan(dwellWeight(title("bronze")));
  });

  it("rates any title above any loss", () => {
    const lostFinal = result({ roundReached: WINNER_ROUND_INDEX - 1, reachedFinal: true });
    expect(dwellWeight(title("bronze"))).toBeGreaterThan(dwellWeight(lostFinal));
  });

  it("ranks a lost final above a semi, and a semi above an early exit", () => {
    const lostFinal = result({ roundReached: WINNER_ROUND_INDEX - 1, reachedFinal: true });
    const semi = result({ roundReached: ROUND_INDEX.semi });
    expect(dwellWeight(lostFinal)).toBeGreaterThan(dwellWeight(semi));
    expect(dwellWeight(semi)).toBeGreaterThan(dwellWeight(earlyExit()));
  });

  it("hurries past the filler", () => {
    expect(dwellWeight(earlyExit())).toBeLessThan(1);
    expect(dwellWeight(qualifyingExit())).toBeLessThan(1);
  });
});

describe("revealDelays", () => {
  it("returns one delay per result", () => {
    const season = [title("major"), earlyExit(), qualifyingExit()];
    expect(revealDelays(season)).toHaveLength(3);
  });

  it("handles an empty season", () => {
    expect(revealDelays([])).toEqual([]);
  });

  it("keeps a whole season inside its budget", () => {
    const busy = Array.from({ length: 20 }, () => title("major"));
    const total = revealDelays(busy).reduce((a, b) => a + b, 0);
    // Rounding and the per-result floor can nudge it a little over.
    expect(total).toBeLessThanOrEqual(SEASON_BUDGET_MS * 1.1);
  });

  it("does not stretch a quiet season to fill the budget", () => {
    const short = [earlyExit(), earlyExit()];
    const total = revealDelays(short).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThan(SEASON_BUDGET_MS / 2);
  });

  it("keeps the emphasis after the budget scales everything down", () => {
    // A realistic busy season: one big title among a lot of noise.
    const season = [
      ...Array.from({ length: 16 }, () => earlyExit()),
      title("major"),
      ...Array.from({ length: 3 }, () => qualifyingExit()),
    ];
    const delays = revealDelays(season);
    const majorDelay = delays[16]!;

    expect(majorDelay).toBeGreaterThan(delays[0]!);
    expect(majorDelay).toBeGreaterThan(delays[delays.length - 1]!);
  });

  it("never drops a result below the visible floor", () => {
    const huge = Array.from({ length: 200 }, () => earlyExit());
    for (const delay of revealDelays(huge)) {
      expect(delay).toBeGreaterThanOrEqual(MIN_DWELL_MS);
    }
  });

  it("respects a caller-supplied budget", () => {
    const season = Array.from({ length: 10 }, () => title("major"));
    const fast = revealDelays(season, 500).reduce((a, b) => a + b, 0);
    const slow = revealDelays(season, 4000).reduce((a, b) => a + b, 0);
    expect(fast).toBeLessThan(slow);
  });
});
