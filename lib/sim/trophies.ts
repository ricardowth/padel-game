/**
 * The trophy case and the career path — what the share card is built from.
 *
 * The reference card this is modelled on shows two rows: the *clubs* a player
 * passed through, and the silverware they won, each with a count badge. Padel
 * has no clubs, so the path is the run of **partners**; the silverware is titles
 * grouped by circuit level, plus the individual honours.
 */
import { WINNER_ROUND_INDEX } from "../data/points";
import type { CareerState, Category, PartnershipRecord } from "../data/types";

/** Levels worth a trophy slot, most prestigious first. */
export const TROPHY_ORDER: Category[] = [
  "major",
  "finals",
  "p1",
  "p2",
  "platinum",
  "gold",
  "silver",
  "bronze",
];

export interface TrophyCount {
  category: Category;
  count: number;
}

/** Titles won at each level, best first, omitting levels never won. */
export function trophyCase(state: CareerState): TrophyCount[] {
  const counts = new Map<Category, number>();

  for (const result of state.results) {
    if (result.roundReached !== WINNER_ROUND_INDEX) continue;
    counts.set(result.category, (counts.get(result.category) ?? 0) + 1);
  }

  return TROPHY_ORDER.filter((c) => (counts.get(c) ?? 0) > 0).map((category) => ({
    category,
    count: counts.get(category)!,
  }));
}

export interface AwardCount {
  type: string;
  count: number;
}

/** Individual honours, most significant first. */
export function awardCase(state: CareerState): AwardCount[] {
  const order = ["fip_no1", "major", "best_smash", "breakout"];
  const counts = new Map<string, number>();

  for (const award of state.awards) {
    // Major *titles* already appear in the trophy case; do not double-count them.
    if (award.type === "major") continue;
    counts.set(award.type, (counts.get(award.type) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => {
      const rank = (t: string) => {
        const i = order.indexOf(t);
        return i === -1 ? order.length : i;
      };
      return rank(a[0]) - rank(b[0]) || b[1] - a[1];
    })
    .map(([type, count]) => ({ type, count }));
}

/**
 * The partners you actually had a run with, in career order.
 *
 * One-season pairings that produced nothing are dropped — a path of fifteen
 * faces says nothing, while the four or five that mattered tell the story.
 * If filtering would leave the path empty, the longest partnerships are kept
 * regardless, because a career always has a path.
 */
export function careerPath(state: CareerState, limit = 8): PartnershipRecord[] {
  const meaningful = state.partnerships.filter(
    (p) => p.seasonsTogether >= 2 || p.titles > 0 || p.finals > 0,
  );

  const source = meaningful.length > 0 ? meaningful : state.partnerships;

  return [...source]
    .sort((a, b) => b.seasonsTogether - a.seasonsTogether || b.titles - a.titles)
    .slice(0, limit)
    .sort((a, b) => a.firstYear - b.firstYear);
}
