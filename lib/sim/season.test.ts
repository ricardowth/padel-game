import { describe, expect, it } from "vitest";

import { ROUND_INDEX } from "../data/points";
import type { Tournament } from "../data/types";
import { winProbability, recoverFatigue, updateForm } from "./match";
import { createRng } from "./rng";
import {
  BAND_CATEGORIES,
  RANKING_COUNTING_RESULTS,
  rankingPointsFrom,
  seasonQuality,
  selectSchedule,
  totalsFrom,
} from "./season";
import type { TournamentOutcome } from "./types";

function tournament(id: string, week: number, category: Tournament["category"]): Tournament {
  const band =
    category === "bronze" || category === "silver"
      ? "developmental"
      : category === "gold" || category === "platinum"
        ? "professional"
        : "elite";
  const winner = { bronze: 40, silver: 80, gold: 150, platinum: 300, p2: 500, p1: 1000, major: 2000, finals: 1500 }[
    category
  ];
  return {
    id,
    name: id,
    city: "Somewhere",
    country: "ES",
    category,
    band,
    week,
    points: { winner },
    prize: { winner: 1000 },
    tours: ["men", "women"],
  };
}

const outcome = (over: Partial<TournamentOutcome> = {}): TournamentOutcome => ({
  tournamentId: "t",
  category: "gold",
  band: "professional",
  week: 1,
  year: 2026,
  partnerId: "P",
  roundReached: ROUND_INDEX.r16,
  matchesWon: 1,
  points: 100,
  prize: 500,
  won: false,
  reachedFinal: false,
  ...over,
});

describe("selectSchedule", () => {
  const calendar = [
    ...Array.from({ length: 30 }, (_, i) => tournament(`b${i}`, i + 1, "bronze")),
    ...Array.from({ length: 20 }, (_, i) => tournament(`g${i}`, i + 1, "gold")),
    ...Array.from({ length: 12 }, (_, i) => tournament(`m${i}`, i + 1, "major")),
    tournament("finals", 50, "finals"),
  ];

  it("only enters events in the player's band", () => {
    const rng = createRng("sched");
    const picked = selectSchedule({ tournaments: calendar, band: "developmental", rank: 200, rng });
    for (const t of picked) {
      expect(BAND_CATEGORIES.developmental).toContain(t.category);
    }
  });

  it("never enters two events in the same week", () => {
    const rng = createRng("sched-weeks");
    const picked = selectSchedule({ tournaments: calendar, band: "professional", rank: 90, rng });
    const weeks = picked.map((t) => t.week);
    expect(new Set(weeks).size).toBe(weeks.length);
  });

  it("returns a schedule in week order", () => {
    const rng = createRng("sched-order");
    const picked = selectSchedule({ tournaments: calendar, band: "elite", rank: 20, rng });
    const weeks = picked.map((t) => t.week);
    expect([...weeks].sort((a, b) => a - b)).toEqual(weeks);
  });

  it("adds the season finals only for a qualified player", () => {
    const rng = createRng("finals");
    const qualified = selectSchedule({ tournaments: calendar, band: "elite", rank: 8, rng });
    const not = selectSchedule({ tournaments: calendar, band: "elite", rank: 40, rng });
    expect(qualified.some((t) => t.category === "finals")).toBe(true);
    expect(not.some((t) => t.category === "finals")).toBe(false);
  });

  it("skips weeks lost to injury", () => {
    const rng = createRng("injured");
    const blocked = new Set([1, 2, 3, 4, 5]);
    const picked = selectSchedule({
      tournaments: calendar,
      band: "developmental",
      rank: 200,
      rng,
      unavailableWeeks: blocked,
    });
    for (const t of picked) expect(blocked.has(t.week)).toBe(false);
  });
});

describe("rankingPointsFrom", () => {
  it("counts only the best 22 results (§7)", () => {
    const results = Array.from({ length: 30 }, (_, i) => ({ points: i + 1 }));
    // Best 22 of 1..30 is 9..30.
    const expected = Array.from({ length: RANKING_COUNTING_RESULTS }, (_, i) => 30 - i).reduce(
      (a, b) => a + b,
      0,
    );
    expect(rankingPointsFrom(results)).toBe(expected);
  });

  it("handles a short season", () => {
    expect(rankingPointsFrom([{ points: 40 }, { points: 10 }])).toBe(50);
    expect(rankingPointsFrom([])).toBe(0);
  });
});

describe("totalsFrom", () => {
  it("counts titles, finals and matches", () => {
    const totals = totalsFrom([
      outcome({ won: true, reachedFinal: true, matchesWon: 5 }),
      outcome({ won: false, reachedFinal: true, matchesWon: 4 }),
      outcome({ won: false, matchesWon: 0 }),
    ]);
    expect(totals.titles).toBe(1);
    expect(totals.finals).toBe(2);
    expect(totals.matchesWon).toBe(9);
    // A win costs no loss; the other two events each end in one.
    expect(totals.matchesPlayed).toBe(5 + 5 + 1);
  });
});

describe("seasonQuality", () => {
  it("is positive for a climbing season and negative for a sliding one", () => {
    const good = totalsFrom([outcome({ won: true, reachedFinal: true, matchesWon: 5 })]);
    expect(seasonQuality(good, 30, 90)).toBeGreaterThan(0);

    const bad = totalsFrom([outcome({ matchesWon: 0 }), outcome({ matchesWon: 0 })]);
    expect(seasonQuality(bad, 150, 60)).toBeLessThan(0);
  });

  it("stays inside -1..1", () => {
    const great = totalsFrom(Array.from({ length: 15 }, () => outcome({ won: true, matchesWon: 6 })));
    expect(seasonQuality(great, 1, 300)).toBeLessThanOrEqual(1);
    const awful = totalsFrom(Array.from({ length: 15 }, () => outcome({ matchesWon: 0 })));
    expect(seasonQuality(awful, 300, 1)).toBeGreaterThanOrEqual(-1);
  });
});

describe("winProbability", () => {
  it("is a coin flip between equals", () => {
    expect(winProbability(75, 75, 70)).toBeCloseTo(0.5, 2);
  });

  it("favours the stronger team", () => {
    expect(winProbability(80, 70, 70)).toBeGreaterThan(0.7);
    expect(winProbability(70, 80, 70)).toBeLessThan(0.3);
  });

  it("always leaves room for an upset (§9)", () => {
    expect(winProbability(99, 20, 70)).toBeLessThanOrEqual(0.96);
    expect(winProbability(20, 99, 70)).toBeGreaterThanOrEqual(0.04);
  });

  it("lets composure decide close matches only", () => {
    const close = winProbability(75, 74, 95) - winProbability(75, 74, 45);
    const blowout = winProbability(90, 60, 95) - winProbability(90, 60, 45);
    expect(close).toBeGreaterThan(0);
    expect(blowout).toBe(0);
  });
});

describe("fatigue and form", () => {
  it("recovers fatigue in the gaps between events", () => {
    expect(recoverFatigue(60, 3)).toBeLessThan(60);
    expect(recoverFatigue(5, 10)).toBe(0);
    expect(recoverFatigue(60, 0)).toBe(60);
  });

  it("heats form up on a deep run and cools it on an early exit", () => {
    expect(updateForm(0, outcome({ matchesWon: 5, won: true }), 5)).toBeGreaterThan(0);
    expect(updateForm(0, outcome({ matchesWon: 0 }), 5)).toBeLessThan(0);
  });

  it("keeps form bounded", () => {
    let form = 0;
    for (let i = 0; i < 50; i++) form = updateForm(form, outcome({ matchesWon: 5, won: true }), 5);
    expect(form).toBeLessThanOrEqual(100);

    for (let i = 0; i < 50; i++) form = updateForm(form, outcome({ matchesWon: 0 }), 5);
    expect(form).toBeGreaterThanOrEqual(-50);
  });
});
