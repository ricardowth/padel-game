/**
 * Static data loading. Everything is bundled JSON — no network at runtime (§13).
 *
 * The imports are dynamic so each tour's ~200KB of player data code-splits away
 * from the initial bundle; the paths stay literal so bundlers can still resolve
 * them statically.
 */
import type { CalendarFile, PlayerPoolFile, Tour, Tournament } from "./types";
import type { PointsFile } from "./points";

export interface TourData {
  tour: Tour;
  /** ~200 real ranked players. */
  seniors: PlayerPoolFile;
  /** ~50 NextGen juniors with staggered debut years. */
  promises: PlayerPoolFile;
  /** Every tournament across both calendars, all bands. */
  tournaments: Tournament[];
  points: PointsFile;
}

const asDefault = <T>(mod: { default: T } | T): T =>
  (mod as { default: T }).default ?? (mod as T);

async function loadPools(tour: Tour): Promise<[PlayerPoolFile, PlayerPoolFile]> {
  if (tour === "men") {
    const [seniors, promises] = await Promise.all([
      import("../../data/players.men.json"),
      import("../../data/promises.men.json"),
    ]);
    return [asDefault(seniors) as PlayerPoolFile, asDefault(promises) as PlayerPoolFile];
  }

  const [seniors, promises] = await Promise.all([
    import("../../data/players.women.json"),
    import("../../data/promises.women.json"),
  ]);
  return [asDefault(seniors) as PlayerPoolFile, asDefault(promises) as PlayerPoolFile];
}

let sharedPromise: Promise<{ tournaments: Tournament[]; points: PointsFile }> | null = null;

/** Calendars and the points table are tour-agnostic, so load them once. */
function loadShared() {
  sharedPromise ??= (async () => {
    const [premier, fip, points] = await Promise.all([
      import("../../data/calendar.premier.json"),
      import("../../data/calendar.fip.json"),
      import("../../data/points.json"),
    ]);

    const tournaments = [
      ...(asDefault(premier) as CalendarFile).tournaments,
      ...(asDefault(fip) as CalendarFile).tournaments,
    ].sort((a, b) => a.week - b.week || a.id.localeCompare(b.id));

    return { tournaments, points: asDefault(points) as unknown as PointsFile };
  })();

  return sharedPromise;
}

const tourCache = new Map<Tour, Promise<TourData>>();

export function loadTourData(tour: Tour): Promise<TourData> {
  let cached = tourCache.get(tour);
  if (!cached) {
    cached = (async () => {
      const [[seniors, promises], shared] = await Promise.all([loadPools(tour), loadShared()]);
      return { tour, seniors, promises, ...shared };
    })();
    tourCache.set(tour, cached);
  }
  return cached;
}
