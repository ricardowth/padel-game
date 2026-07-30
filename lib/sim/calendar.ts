/**
 * Calendar rotation (§8).
 *
 * In-game year 1 replays the real 2026 season verbatim. Later years are
 * procedurally rotated from it so a 19-season career never plays the identical
 * fixture list twice.
 *
 * Rotation deliberately **keeps every real venue and event name** and only
 * moves them: hosts are reshuffled between same-category slots and weeks are
 * jittered. Inventing names would trade the authenticity the data was scraped
 * for; a Major moving from week 22 to week 20, and Rome hosting the slot Doha
 * had, is exactly how a real calendar drifts year to year.
 */
import type { Category, Tournament } from "../data/types";
import type { Rng } from "./rng";

/** Weeks an event may drift from its real slot. */
const MAX_WEEK_DRIFT = 2;
const MIN_WEEK = 2;
const MAX_WEEK = 50;

/** The venue identity that travels between slots. */
interface Host {
  name: string;
  city: string;
  country: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Rotates a calendar for `year`. Returns the base list untouched when `year`
 * matches the calendar's own year, so year 1 is guaranteed verbatim.
 */
export function rotateCalendar(
  base: Tournament[],
  year: number,
  baseYear: number,
  rng: Rng,
): Tournament[] {
  if (year <= baseYear) return base;

  // Group by category so a Major only ever swaps with another Major.
  const byCategory = new Map<Category, Tournament[]>();
  for (const tournament of base) {
    const list = byCategory.get(tournament.category) ?? [];
    list.push(tournament);
    byCategory.set(tournament.category, list);
  }

  const rotated: Tournament[] = [];

  for (const [, events] of byCategory) {
    const hosts: Host[] = events.map((e) => ({
      name: e.name,
      city: e.city,
      country: e.country,
      startDate: e.startDate,
      endDate: e.endDate,
    }));
    const shuffledHosts = rng.shuffle(hosts);

    // Weeks stay attached to the slot, not the host, so the season keeps its
    // real rhythm (Majors spread across the year, Bronzes filling the gaps).
    const takenWeeks = new Set<number>();

    events.forEach((event, index) => {
      const host = shuffledHosts[index]!;

      let week = event.week + rng.int(-MAX_WEEK_DRIFT, MAX_WEEK_DRIFT);
      week = Math.max(MIN_WEEK, Math.min(MAX_WEEK, week));

      // Two events of the same category in one week is fine on a 235-event
      // tour, but nudge obvious pile-ups so the schedule still spreads.
      let guard = 0;
      while (takenWeeks.has(week) && guard++ < 4) {
        week = Math.max(MIN_WEEK, Math.min(MAX_WEEK, week + (rng.chance(0.5) ? 1 : -1)));
      }
      takenWeeks.add(week);

      rotated.push({
        ...event,
        // Ids must stay unique per season but stable within it.
        id: `${event.id}-y${year}`,
        name: host.name,
        city: host.city,
        country: host.country,
        week,
        startDate: host.startDate ? `${year}${host.startDate.slice(4)}` : undefined,
        endDate: host.endDate ? `${year}${host.endDate.slice(4)}` : undefined,
      });
    });
  }

  return rotated.sort((a, b) => a.week - b.week || a.id.localeCompare(b.id));
}
