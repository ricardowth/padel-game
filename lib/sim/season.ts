/**
 * Season assembly: which events the player enters, how the season is scored,
 * and what silverware comes out of it (§7, §9).
 */
import type { PointsFile } from "../data/points";
import type { Award, Band, Category, Player, Tournament } from "../data/types";
import { effectiveOvr } from "./pool";
import type { Rng } from "./rng";
import type { TournamentOutcome, World } from "./types";

/** Categories each circuit band lets you into (§7). */
export const BAND_CATEGORIES: Record<Band, Category[]> = {
  developmental: ["bronze", "silver"],
  professional: ["gold", "platinum"],
  elite: ["p2", "p1", "major"],
};

/** Only the top 16 make the season-ending masters. */
export const FINALS_QUALIFYING_RANK = 16;

/** The FIP ranking counts your best 22 results (§7). */
export const RANKING_COUNTING_RESULTS = 22;

/** A realistic season load — enough events to fill a best-22, not so many you break. */
const MIN_EVENTS = 14;
const MAX_EVENTS = 18;

export interface ScheduleOptions {
  tournaments: Tournament[];
  band: Band;
  rank: number;
  rng: Rng;
  /** Weeks lost to injury or a ban; the schedule shrinks to match. */
  unavailableWeeks?: Set<number>;
  /** Extra events accepted via wildcard decisions. */
  wildcards?: Tournament[];
}

/**
 * Picks a season's slate: one event per week at most, drawn from the bands the
 * player has access to, spread across the calendar rather than clustered.
 */
export function selectSchedule({
  tournaments,
  band,
  rank,
  rng,
  unavailableWeeks = new Set(),
  wildcards = [],
}: ScheduleOptions): Tournament[] {
  const allowed = new Set<Category>(BAND_CATEGORIES[band]);

  const eligible = tournaments.filter((t) => {
    if (unavailableWeeks.has(t.week)) return false;
    if (t.category === "finals") return rank > 0 && rank <= FINALS_QUALIFYING_RANK;
    return allowed.has(t.category);
  });

  // Group by week so we never enter two events at once.
  const byWeek = new Map<number, Tournament[]>();
  for (const tournament of eligible) {
    const list = byWeek.get(tournament.week) ?? [];
    list.push(tournament);
    byWeek.set(tournament.week, list);
  }

  const weeks = rng.shuffle([...byWeek.keys()]);
  const target = rng.int(MIN_EVENTS, MAX_EVENTS);

  const picked: Tournament[] = [];
  for (const week of weeks) {
    if (picked.length >= target) break;
    const options = byWeek.get(week)!;
    // Prefer the biggest event available that week — that is what a pro does.
    const best = options.reduce((a, b) =>
      (b.points.winner ?? 0) > (a.points.winner ?? 0) ? b : a,
    );
    picked.push(best);
  }

  // The season-ending masters is never optional.
  const finals = eligible.filter((t) => t.category === "finals");
  for (const f of finals) if (!picked.some((t) => t.id === f.id)) picked.push(f);

  for (const wildcard of wildcards) {
    if (!picked.some((t) => t.id === wildcard.id)) picked.push(wildcard);
  }

  return picked.sort((a, b) => a.week - b.week);
}

/** Best-22 total from a season's results (§7). */
export function rankingPointsFrom(outcomes: { points: number }[]): number {
  return [...outcomes]
    .map((o) => o.points)
    .sort((a, b) => b - a)
    .slice(0, RANKING_COUNTING_RESULTS)
    .reduce((sum, p) => sum + p, 0);
}

export interface SeasonTotals {
  titles: number;
  finals: number;
  matchesWon: number;
  matchesPlayed: number;
  points: number;
  earnings: number;
}

export function totalsFrom(outcomes: TournamentOutcome[]): SeasonTotals {
  let titles = 0;
  let finalsReached = 0;
  let matchesWon = 0;
  let matchesPlayed = 0;
  let earnings = 0;

  for (const outcome of outcomes) {
    if (outcome.won) titles++;
    if (outcome.reachedFinal) finalsReached++;
    matchesWon += outcome.matchesWon;
    // Every event is one loss, except the one you win.
    matchesPlayed += outcome.matchesWon + (outcome.won ? 0 : 1);
    earnings += outcome.prize;
  }

  return {
    titles,
    finals: finalsReached,
    matchesWon,
    matchesPlayed,
    points: rankingPointsFrom(outcomes),
    earnings,
  };
}

/**
 * How the season went, normalised to -1 (disaster) .. +1 (breakout). Feeds the
 * partner market and the context weighting on in-season events.
 */
export function seasonQuality(
  totals: SeasonTotals,
  rank: number,
  previousRank: number,
): number {
  const winRate = totals.matchesPlayed > 0 ? totals.matchesWon / totals.matchesPlayed : 0;
  let quality = (winRate - 0.5) * 1.4;

  if (previousRank > 0) {
    // Climbing 50 places is a strong season; sliding 50 is a bad one.
    quality += Math.max(-0.5, Math.min(0.5, (previousRank - rank) / 100));
  }
  quality += Math.min(0.3, totals.titles * 0.1);

  return Math.max(-1, Math.min(1, quality));
}

export interface AwardOptions {
  you: Player;
  world: World;
  outcomes: TournamentOutcome[];
  rank: number;
  previousRank: number;
  age: number;
  year: number;
}

/** Season honours (§14's trophy case). */
export function computeAwards({
  you,
  world,
  outcomes,
  rank,
  previousRank,
  age,
  year,
}: AwardOptions): Award[] {
  const awards: Award[] = [];

  if (rank === 1) awards.push({ type: "fip_no1", year });

  for (const outcome of outcomes) {
    if (outcome.won && outcome.category === "major") awards.push({ type: "major", year });
  }

  // Best Smash: the biggest remate on tour, and you have to be relevant to win it.
  if (rank <= 30) {
    let best = you.attributes.remate;
    for (const id of world.activeIds) {
      const rival = world.players.get(id);
      if (rival && rival.id !== you.id && rival.attributes.remate > best) {
        best = rival.attributes.remate;
      }
    }
    if (best === you.attributes.remate) awards.push({ type: "best_smash", year });
  }

  // Breakout of the year: young, and a big jump up the ladder.
  if (age <= 23 && previousRank > 0 && previousRank - rank >= 40 && rank <= 80) {
    awards.push({ type: "breakout", year });
  }

  return awards;
}

/** Where the player's points put them among the NPC field. */
export function rankAmong(world: World, points: number): number {
  let ahead = 0;
  for (const id of world.activeIds) {
    if ((world.points.get(id) ?? 0) > points) ahead++;
  }
  return ahead + 1;
}

/** Highest `remate` on tour — used by the Best Smash award and by scouting text. */
export function topRemate(world: World): number {
  let best = 0;
  for (const id of world.activeIds) {
    const player = world.players.get(id);
    if (player && player.attributes.remate > best) best = player.attributes.remate;
  }
  return best;
}

/** Rough level of the tour right now, for balance assertions in tests. */
export function tourMedianOvr(world: World): number {
  const ovrs = world.activeIds
    .map((id) => world.players.get(id))
    .filter((p): p is Player => Boolean(p))
    .map(effectiveOvr)
    .sort((a, b) => a - b);
  return ovrs.length === 0 ? 0 : ovrs[Math.floor(ovrs.length / 2)]!;
}
