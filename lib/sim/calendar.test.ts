import { beforeAll, describe, expect, it } from "vitest";

import { loadTourData } from "../data/load";
import type { Tournament } from "../data/types";
import { rotateCalendar } from "./calendar";
import { createRng } from "./rng";

let base: Tournament[];
const BASE_YEAR = 2026;

beforeAll(async () => {
  base = (await loadTourData("men")).tournaments;
}, 60_000);

const countByCategory = (list: Tournament[]) =>
  list.reduce<Record<string, number>>((acc, t) => {
    acc[t.category] = (acc[t.category] ?? 0) + 1;
    return acc;
  }, {});

describe("rotateCalendar", () => {
  it("plays year 1 verbatim (§8)", () => {
    const rng = createRng("rotate");
    expect(rotateCalendar(base, BASE_YEAR, BASE_YEAR, rng)).toBe(base);
    expect(rotateCalendar(base, BASE_YEAR - 1, BASE_YEAR, rng)).toBe(base);
  });

  it("keeps the same category mix in later years", () => {
    const rng = createRng("mix");
    const rotated = rotateCalendar(base, BASE_YEAR + 5, BASE_YEAR, rng);
    expect(rotated).toHaveLength(base.length);
    expect(countByCategory(rotated)).toEqual(countByCategory(base));
  });

  it("keeps every real venue — rotation moves hosts, it does not invent them", () => {
    const rng = createRng("hosts");
    const rotated = rotateCalendar(base, BASE_YEAR + 3, BASE_YEAR, rng);

    const cities = (list: Tournament[]) => [...new Set(list.map((t) => t.city))].sort();
    expect(cities(rotated)).toEqual(cities(base));

    const names = (list: Tournament[]) => [...new Set(list.map((t) => t.name))].sort();
    expect(names(rotated)).toEqual(names(base));
  });

  it("actually changes the fixture list", () => {
    const rng = createRng("changed");
    const rotated = rotateCalendar(base, BASE_YEAR + 1, BASE_YEAR, rng);

    const signature = (list: Tournament[]) =>
      list.map((t) => `${t.category}:${t.city}:${t.week}`).join("|");
    expect(signature(rotated)).not.toEqual(signature(base));
  });

  it("keeps weeks inside a real season", () => {
    const rng = createRng("weeks");
    for (const year of [BASE_YEAR + 1, BASE_YEAR + 9, BASE_YEAR + 19]) {
      for (const t of rotateCalendar(base, year, BASE_YEAR, rng)) {
        expect(t.week).toBeGreaterThanOrEqual(1);
        expect(t.week).toBeLessThanOrEqual(52);
      }
    }
  });

  it("keeps ids unique within a season and stamps the year", () => {
    const rng = createRng("ids");
    const rotated = rotateCalendar(base, BASE_YEAR + 2, BASE_YEAR, rng);
    expect(new Set(rotated.map((t) => t.id)).size).toBe(rotated.length);
    for (const t of rotated) expect(t.id).toMatch(/-y2028$/);
  });

  it("carries the points and prize tables through untouched", () => {
    const rng = createRng("points");
    const rotated = rotateCalendar(base, BASE_YEAR + 4, BASE_YEAR, rng);

    for (const t of rotated) {
      const original = base.find((b) => b.category === t.category)!;
      expect(t.points.winner).toBe(original.points.winner);
      expect(t.prize.winner).toBe(original.prize.winner);
      expect(t.band).toBe(original.band);
    }
  });

  it("re-dates events into the season being played", () => {
    const rng = createRng("dates");
    const rotated = rotateCalendar(base, BASE_YEAR + 7, BASE_YEAR, rng);
    for (const t of rotated) {
      if (t.startDate) expect(t.startDate.startsWith("2033-")).toBe(true);
    }
  });

  it("is deterministic for a given seed", () => {
    const a = rotateCalendar(base, BASE_YEAR + 6, BASE_YEAR, createRng("same"));
    const b = rotateCalendar(base, BASE_YEAR + 6, BASE_YEAR, createRng("same"));
    expect(a.map((t) => t.id + t.week)).toEqual(b.map((t) => t.id + t.week));
  });
});
