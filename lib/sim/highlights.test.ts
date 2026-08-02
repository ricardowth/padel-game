import { describe, expect, it } from "vitest";

import { ROUND_INDEX, WINNER_ROUND_INDEX } from "../data/points";
import { seasonHighlights, type HighlightInput } from "./highlights";
import type { TournamentOutcome } from "./types";

const event = (over: Partial<TournamentOutcome> = {}): TournamentOutcome => ({
  tournamentId: "t",
  tournamentName: "Madrid P1",
  category: "p1",
  band: "elite",
  week: 20,
  year: 2030,
  partnerId: "P",
  roundReached: ROUND_INDEX.r16,
  matchesWon: 1,
  points: 90,
  prize: 2400,
  cost: 3000,
  hadToQualify: false,
  qualified: true,
  won: false,
  reachedFinal: false,
  ...over,
});

const input = (over: Partial<HighlightInput> = {}): HighlightInput => ({
  outcomes: [],
  rank: 60,
  previousRank: 60,
  previousBestRank: 60,
  titles: 0,
  bigTitles: 0,
  careerTitlesBefore: 5,
  qualifyingAttempts: 0,
  qualifyingFailures: 0,
  net: 10_000,
  banned: false,
  ...over,
});

const keys = (i: HighlightInput) => seasonHighlights(i).map((h) => h.key);

describe("seasonHighlights", () => {
  it("never runs longer than three lines", () => {
    const busy = input({
      outcomes: [event({ won: true, roundReached: WINNER_ROUND_INDEX, category: "major" })],
      titles: 4,
      careerTitlesBefore: 0,
      rank: 1,
      previousRank: 90,
      previousBestRank: 90,
      qualifyingAttempts: 6,
      qualifyingFailures: 5,
      net: -20_000,
      rivalName: "Agustin Tapia",
      rivalRank: 20,
      wasAheadOfRival: false,
    });
    expect(seasonHighlights(busy).length).toBeLessThanOrEqual(3);
  });

  it("emits only keys, never prose (§13)", () => {
    for (const key of keys(input({ outcomes: [event({ won: true })], titles: 1 }))) {
      expect(key).toMatch(/^season\.highlight\./);
    }
  });

  it("does not name the same title twice", () => {
    // "Your first title — Madrid P1" followed by "Won Madrid P1" reads as a bug.
    const result = keys(
      input({
        outcomes: [event({ won: true, roundReached: WINNER_ROUND_INDEX })],
        titles: 1,
        careerTitlesBefore: 0,
      }),
    );
    expect(result).toContain("season.highlight.first_title");
    expect(result).not.toContain("season.highlight.title");
  });

  it("calls out a first title before anything else", () => {
    const result = seasonHighlights(
      input({
        outcomes: [event({ won: true, roundReached: WINNER_ROUND_INDEX })],
        titles: 1,
        careerTitlesBefore: 0,
      }),
    );
    expect(result[0]!.key).toBe("season.highlight.first_title");
    expect(result[0]!.values?.tournament).toBe("Madrid P1");
  });

  it("does not call a later title the first one", () => {
    expect(
      keys(
        input({
          outcomes: [event({ won: true, roundReached: WINNER_ROUND_INDEX })],
          titles: 1,
          careerTitlesBefore: 9,
        }),
      ),
    ).not.toContain("season.highlight.first_title");
  });

  it("names the most prestigious title of the season", () => {
    const result = seasonHighlights(
      input({
        outcomes: [
          event({ won: true, roundReached: WINNER_ROUND_INDEX, category: "bronze", tournamentName: "Some Bronze" }),
          event({ won: true, roundReached: WINNER_ROUND_INDEX, category: "major", tournamentName: "Italy Major" }),
        ],
        titles: 2,
      }),
    );
    const title = result.find((h) => h.key === "season.highlight.title");
    expect(title?.values?.tournament).toBe("Italy Major");
  });

  it("marks reaching world number one", () => {
    expect(keys(input({ rank: 1, previousBestRank: 12 }))).toContain(
      "season.highlight.world_number_one",
    );
  });

  it("marks a top-ten breakthrough once, not every season after", () => {
    expect(keys(input({ rank: 8, previousBestRank: 40 }))).toContain(
      "season.highlight.reached_top",
    );
    // Already been there — no longer news.
    expect(keys(input({ rank: 8, previousBestRank: 5 }))).not.toContain(
      "season.highlight.reached_top",
    );
  });

  it("reports crossing the rival in both directions", () => {
    expect(
      keys(input({ rank: 20, rivalName: "Rival", rivalRank: 30, wasAheadOfRival: false })),
    ).toContain("season.highlight.rival_passed");

    expect(
      keys(input({ rank: 40, rivalName: "Rival", rivalRank: 30, wasAheadOfRival: true })),
    ).toContain("season.highlight.rival_lost");
  });

  it("stays quiet about a rival whose standing did not change", () => {
    const steady = keys(
      input({ rank: 20, rivalName: "Rival", rivalRank: 30, wasAheadOfRival: true }),
    );
    expect(steady).not.toContain("season.highlight.rival_passed");
    expect(steady).not.toContain("season.highlight.rival_lost");
  });

  it("says something honest about an empty season", () => {
    expect(keys(input({ outcomes: [event()], titles: 0 }))).toContain(
      "season.highlight.nothing_to_show",
    );
  });

  it("reports qualifying trouble and lost money", () => {
    expect(
      keys(input({ outcomes: [event()], qualifyingAttempts: 6, qualifyingFailures: 4 })),
    ).toContain("season.highlight.qualifying_woes");

    expect(keys(input({ outcomes: [event()], net: -8000 }))).toContain(
      "season.highlight.lost_money",
    );
  });

  it("reports big rank movement in both directions", () => {
    expect(keys(input({ outcomes: [event()], rank: 40, previousRank: 90 }))).toContain(
      "season.highlight.climbed",
    );
    expect(keys(input({ outcomes: [event()], rank: 120, previousRank: 60 }))).toContain(
      "season.highlight.slipped",
    );
  });

  it("says only that you were suspended", () => {
    const result = seasonHighlights(
      input({ banned: true, outcomes: [event({ won: true })], titles: 3 }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.key).toBe("season.highlight.banned");
  });

  it("tags every line with a tone the UI can colour", () => {
    for (const highlight of seasonHighlights(
      input({ outcomes: [event({ won: true })], titles: 1, careerTitlesBefore: 0 }),
    )) {
      expect(["good", "bad", "neutral"]).toContain(highlight.tone);
    }
  });
});
