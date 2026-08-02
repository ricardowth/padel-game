/**
 * How long each result sits on screen while a season plays out.
 *
 * A fixed tick treats a first-round exit in Ljubljana like a Major final, which
 * is both slow and boring: most of a season is routine, and the two results
 * worth watching flash past at the same speed as the other sixteen. Dwell time
 * is therefore weighted by what actually happened, and the whole season is
 * scaled to fit a budget — so a busy year speeds up rather than dragging.
 */
import { ROUND_INDEX, WINNER_ROUND_INDEX } from "../data/points";
import type { Category } from "../data/types";
import type { TournamentOutcome } from "../sim/types";

/** Titles at this level are the moments a career is remembered for. */
const HEADLINE: Category[] = ["major", "finals", "p1"];
const NOTABLE: Category[] = ["p2", "platinum"];

/** Relative dwell. 1 is an ordinary result; the scale is deliberately wide. */
export function dwellWeight(outcome: TournamentOutcome): number {
  if (outcome.won) {
    if (HEADLINE.includes(outcome.category)) return 4;
    if (NOTABLE.includes(outcome.category)) return 3;
    return 2.2;
  }

  // Losing a final still stings enough to be worth a beat.
  if (outcome.roundReached === WINNER_ROUND_INDEX - 1) return 2;
  if (outcome.roundReached === ROUND_INDEX.semi) return 1.3;

  // Never made the draw, or out immediately — these are the filler.
  if (!outcome.qualified) return 0.5;
  if (outcome.roundReached <= ROUND_INDEX.r32) return 0.5;

  return 0.8;
}

/** Nothing may flash by faster than the eye can register it. */
export const MIN_DWELL_MS = 45;
/** A season is worth watching; nineteen of them are not. */
export const SEASON_BUDGET_MS = 3200;
/** What one unit of weight is worth before the budget scales it. */
const BASE_DWELL_MS = 150;

/**
 * Per-result delays, in order.
 *
 * Weights set the *shape* of the pacing and the budget sets its length, so a
 * six-event season breathes and a twenty-event season moves — without either
 * losing the emphasis on the results that mattered.
 */
export function revealDelays(
  outcomes: readonly TournamentOutcome[],
  budgetMs = SEASON_BUDGET_MS,
): number[] {
  if (outcomes.length === 0) return [];

  const weights = outcomes.map(dwellWeight);
  const raw = weights.reduce((sum, w) => sum + w, 0) * BASE_DWELL_MS;

  // Only ever speed up. A quiet season should not be stretched to fill the budget.
  const scale = raw > budgetMs ? budgetMs / raw : 1;

  return weights.map((w) => Math.max(MIN_DWELL_MS, Math.round(w * BASE_DWELL_MS * scale)));
}

/** True when the viewer has asked for less motion — stream nothing, show it all. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
