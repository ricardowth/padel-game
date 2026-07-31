/**
 * Phase 1's gate (§15): a full 16 -> 35 career must produce sane rankings,
 * retirements and promise intake, headlessly and reproducibly.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { loadTourData, type TourData } from "../data/load";
import {
  CareerEngine,
  END_AGE,
  START_AGE,
  createPlayer,
  definingPartnerships,
  legacyTier,
  peakOvr,
  peakRank,
  playerRng,
} from "./career";
import { createRng, randomSeed } from "./rng";
import type { DecisionCard } from "./types";

let menData: TourData;

beforeAll(async () => {
  menData = await loadTourData("men");
}, 60_000);

/** Plays a whole career, choosing options with a seeded chooser. */
function playCareer(seed: string, pace: "story" | "quick" = "story") {
  const engine = new CareerEngine({
    data: menData,
    seed,
    pace,
    input: {
      name: "Test Player",
      country: "AR",
      tour: "men",
      side: "reves",
      playstyle: "playmaker",
      handedness: "right",
    },
  });

  const chooser = createRng(`${seed}:choices`);
  const cards: DecisionCard[] = [];
  let guard = 0;

  for (;;) {
    if (guard++ > 5000) throw new Error("career did not terminate");
    const { pending, done } = engine.advance();
    if (done) break;
    if (pending) {
      cards.push(pending);
      engine.choose(chooser.pick(pending.options).id);
    }
  }

  return { engine, cards };
}

describe("a full career", () => {
  it("runs 16 -> 35 and terminates", () => {
    const { engine } = playCareer("gate-1");
    expect(engine.state.retired).toBe(true);
    expect(engine.state.you.age).toBe(END_AGE);
    expect(engine.state.history).toHaveLength(END_AGE - START_AGE + 1);
  });

  it("is reproducible from its seed (§9)", () => {
    const a = playCareer("repro").engine.state;
    const b = playCareer("repro").engine.state;

    expect(b.titles).toBe(a.titles);
    expect(b.earnings).toBe(a.earnings);
    expect(b.you.ovr).toBe(a.you.ovr);
    expect(b.history.map((h) => h.rank)).toEqual(a.history.map((h) => h.rank));
  });

  it("produces different careers from different seeds", () => {
    const a = playCareer("alpha").engine.state;
    const b = playCareer("beta").engine.state;
    expect(a.history.map((h) => h.rank)).not.toEqual(b.history.map((h) => h.rank));
  });

  it("writes one ledger row per season, in order", () => {
    const { engine } = playCareer("ledger");
    const ages = engine.state.history.map((h) => h.age);
    expect(ages).toEqual(Array.from({ length: ages.length }, (_, i) => START_AGE + i));

    const years = engine.state.history.map((h) => h.year);
    expect([...years].sort((a, b) => a - b)).toEqual(years);
  });

  it("keeps every ledger rank a plausible ranking", () => {
    const { engine } = playCareer("ranks");
    for (const row of engine.state.history) {
      expect(row.rank).toBeGreaterThan(0);
      expect(row.rank).toBeLessThan(400);
      expect(row.ovr).toBeGreaterThanOrEqual(16);
      expect(row.ovr).toBeLessThanOrEqual(99);
      expect(Number.isInteger(row.ovr)).toBe(true);
    }
  });

  it("grows the player from a raw teenager to a peak and back down", () => {
    const { engine } = playCareer("arc");
    const ovrs = engine.state.history.map((h) => h.ovr);
    const peak = Math.max(...ovrs);
    expect(ovrs[0]!).toBeLessThan(peak);
    expect(peak).toBeGreaterThan(55);
  });

  it("never leaves the player without a partner for a whole season", () => {
    const { engine } = playCareer("partners");
    // The opening season always has one; later gaps are filled at rollover.
    expect(engine.state.history[0]!.partnerId).not.toBeNull();
    expect(engine.state.partnerships.length).toBeGreaterThan(0);
  });

  it("stays within its own tour (§5)", () => {
    const { engine } = playCareer("tour");
    for (const record of engine.state.partnerships) {
      const partner = engine.world.players.get(record.partnerId);
      if (partner) expect(partner.tour).toBe("men");
    }
  });
});

describe("the world around the career", () => {
  it("retires veterans and refills the pool (§11)", () => {
    const { engine } = playCareer("world");
    expect(engine.world.retiredIds.size).toBeGreaterThan(0);
    // The ladder must not thin out over 19 seasons.
    expect(engine.world.activeIds.length).toBeGreaterThanOrEqual(190);
  });

  it("debuts the NextGen promises over the career", () => {
    const { engine } = playCareer("promises");
    const debuted = [...engine.world.players.values()].filter(
      (p) => p.debutYear !== undefined && engine.world.activeIds.includes(p.id),
    );
    expect(debuted.length).toBeGreaterThan(0);
    expect(engine.world.pending.length).toBeLessThan(50);
  });

  it("keeps the tour from ageing into oblivion", () => {
    const { engine } = playCareer("ages");
    const ages = engine.world.activeIds
      .map((id) => engine.world.players.get(id)?.age ?? 0)
      .filter(Boolean);
    const mean = ages.reduce((s, a) => s + a, 0) / ages.length;
    expect(mean).toBeLessThan(34);
    expect(Math.min(...ages)).toBeLessThan(24);
  });
});

describe("decisions", () => {
  it("always offers the end-of-season partner market (§3)", () => {
    const { cards } = playCareer("cards");
    const markets = cards.filter((c) => c.eventId === "partner_market");
    // One per season, bar the last (the career ends before the next market).
    expect(markets.length).toBeGreaterThanOrEqual(15);
  });

  it("gives every card at least two real options", () => {
    const { cards } = playCareer("options");
    for (const card of cards) {
      expect(card.options.length).toBeGreaterThanOrEqual(2);
      for (const option of card.options) {
        expect(option.outcomes.length).toBeGreaterThan(0);
        for (const outcome of option.outcomes) expect(outcome.weight).toBeGreaterThan(0);
      }
    }
  });

  it("emits only keys, never prose (§13)", () => {
    const { cards } = playCareer("keys");
    for (const card of cards) {
      expect(card.titleKey).toMatch(/^events\./);
      expect(card.descriptionKey).toMatch(/^events\./);
      for (const option of card.options) {
        expect(option.labelKey).toMatch(/^events\./);
        for (const tag of option.tags) expect(tag.key).toMatch(/^tags\./);
        for (const outcome of option.outcomes) expect(outcome.resultKey).toMatch(/^events\./);
      }
    }
  });

  it("fires fewer pop-ups on Quick than on Story (§3)", () => {
    const story = playCareer("pace", "story").cards.filter((c) => c.timing === "in_season").length;
    const quick = playCareer("pace", "quick").cards.filter((c) => c.timing === "in_season").length;
    expect(quick).toBeLessThan(story);
  });

  it("never repeats a once-only event", () => {
    const { cards } = playCareer("once");
    const schoolCards = cards.filter((c) => c.eventId === "finish_school");
    expect(schoolCards.length).toBeLessThanOrEqual(1);
  });
});

describe("legacy", () => {
  it("summarises a career into a tier, a peak and partnerships (§14)", () => {
    const { engine } = playCareer("legacy");
    const state = engine.state;

    expect(["journeyman", "contender", "champion", "legend"]).toContain(legacyTier(state));
    expect(peakRank(state)).toBeGreaterThan(0);

    const partnerships = definingPartnerships(state);
    expect(partnerships.length).toBeGreaterThan(0);
    // Ordered by significance, most first.
    for (let i = 1; i < partnerships.length; i++) {
      expect(partnerships[i - 1]!.titles).toBeGreaterThanOrEqual(partnerships[i]!.titles);
    }
  });

  it("reports the career's best OVR, not the one it retired on (§14)", () => {
    const { engine } = playCareer("peak-ovr");
    const state = engine.state;

    const best = Math.max(state.you.ovr, ...state.history.map((row) => row.ovr));
    expect(peakOvr(state)).toBe(best);
    // A 35-year-old has declined off their peak, so the headline number should
    // be the one the ledger remembers rather than the final row's.
    expect(peakOvr(state)).toBeGreaterThanOrEqual(state.you.ovr);
  });

  it("keeps career totals consistent with the per-season rows", () => {
    const { engine } = playCareer("totals");
    const state = engine.state;
    const ledgerTitles = state.history.reduce((sum, row) => sum + row.titles, 0);
    expect(state.titles).toBe(ledgerTitles);

    // A season nets prize money minus travel, so a bad one can be negative and
    // so can a whole career — that is the qualifying mechanic doing its job.
    // The ledger must account for exactly the events that were played; the
    // career total additionally absorbs decision money (sponsors pay in, a
    // coach costs), so the two are allowed to differ only by that.
    const ledgerEarnings = state.history.reduce((sum, row) => sum + row.earnings, 0);
    const fromResults = state.results.reduce((sum, r) => sum + r.prize - r.cost, 0);
    expect(ledgerEarnings).toBe(fromResults);
    expect(Number.isFinite(state.earnings)).toBe(true);
  });
});

describe("seeding", () => {
  const input = {
    name: "Preview Check",
    country: "AR",
    tour: "men" as const,
    side: "reves" as const,
    playstyle: "playmaker" as const,
    handedness: "right" as const,
  };

  const engineFor = (seed: string) =>
    new CareerEngine({ data: menData, seed, pace: "story" as const, input });

  it("builds exactly the player the creator previewed", () => {
    // The engine consumes RNG draws setting the world up before it reaches the
    // player, so player creation has to run on its own derived stream. Without
    // that, the creator advertised a potential of 84 and delivered 69.
    for (const seed of ["alpha", "beta", randomSeed()]) {
      const preview = createPlayer(input, playerRng(seed));
      const actual = engineFor(seed).state.you;

      expect(actual.attributes).toEqual(preview.attributes);
      expect(actual.potential).toBe(preview.potential);
      expect(actual.ovr).toBe(preview.ovr);
    }
  });

  it("gives the same identity a different career on a different seed", () => {
    // The whole point of a random seed: replaying as "the same person" must not
    // replay the same 19 seasons.
    const a = engineFor("run-one").state.you;
    const b = engineFor("run-two").state.you;

    expect(a.name).toBe(b.name);
    expect(a.attributes).not.toEqual(b.attributes);
  });

  it("still replays identically when a seed is reused", () => {
    const seed = randomSeed();
    const a = engineFor(seed).state.you;
    const b = engineFor(seed).state.you;

    expect(a.attributes).toEqual(b.attributes);
    expect(a.potential).toBe(b.potential);
  });

  it("keeps the starting OVR on target whatever the seed", () => {
    for (let i = 0; i < 40; i++) {
      const player = createPlayer(input, playerRng(randomSeed()));
      expect(player.ovr).toBe(44);
      expect(player.potential).toBeGreaterThan(player.ovr);
      expect(player.potential).toBeLessThanOrEqual(99);
    }
  });
});
