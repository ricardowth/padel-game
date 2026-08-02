/**
 * Tournament & round resolution (§9). No live points — each round is a single
 * seeded Bernoulli draw off the strength difference between the two teams.
 */
import type { Category, Tournament } from "../data/types";
import {
  ROUND_INDEX,
  ROUND_LADDER,
  WINNER_ROUND_INDEX,
  hasDirectEntry,
  type PointsFile,
} from "../data/points";
import { pairStrength } from "./pool";
import type { Rng } from "./rng";
import type { Pair, TournamentOutcome, World } from "./types";

/**
 * Logistic scale. At 4.5, a 5-point strength edge wins ~75% of the time and a
 * 15-point edge ~96% — decisive but never certain, so upsets always exist (§9).
 */
const LOGISTIC_SCALE = 4.5;

/** Never let a match become a formality in either direction. */
const MIN_WIN_PROB = 0.04;
const MAX_WIN_PROB = 0.96;

/**
 * Slice of the pair ladder each category draws its field from, as percentiles
 * (0 = strongest pair on tour). This is what makes band choice matter: enter a
 * Major and you play the top fifth of the tour from round one, while a Bronze
 * field is drawn from the tail.
 *
 * The windows are deliberately skewed toward the bottom because the pool only
 * holds the real top 200 — the players who actually contest Bronze and Silver
 * events rank far below that, so our tail has to stand in for them (§7's
 * Low / Medium / Highest field-strength column).
 */
const FIELD_WINDOW: Record<Category, [number, number]> = {
  finals: [0, 0.08],
  major: [0, 0.22],
  p1: [0.06, 0.32],
  p2: [0.18, 0.5],
  platinum: [0.32, 0.68],
  gold: [0.45, 0.8],
  silver: [0.68, 0.95],
  bronze: [0.8, 1],
};

/** Every distinct pair currently on tour, strongest first. */
export function rankedPairs(world: World): { pair: Pair; strength: number }[] {
  const seen = new Set<Pair>();
  const out: { pair: Pair; strength: number }[] = [];

  for (const id of world.activeIds) {
    const pair = world.pairOf.get(id);
    if (!pair || seen.has(pair)) continue;
    seen.add(pair);
    out.push({ pair, strength: pairStrength(pair, world) });
  }

  out.sort((a, b) => b.strength - a.strength);
  return out;
}

/**
 * Builds a draw for `tournament`, weakest opponent first — which is what a
 * seeded bracket feels like from inside it: the rounds get harder as you go.
 */
export function buildField(
  tournament: Tournament,
  world: World,
  points: PointsFile,
  rng: Rng,
  excludeIds: Set<string>,
): number[] {
  const spec = points.categories[tournament.category];
  const ladder = rankedPairs(world).filter(
    ({ pair }) => !excludeIds.has(pair.driveId) && !excludeIds.has(pair.revesId),
  );

  const roundsToWin = WINNER_ROUND_INDEX - ROUND_INDEX[spec.firstRound];
  if (ladder.length === 0) return Array.from({ length: roundsToWin }, () => 60);

  const [lo, hi] = FIELD_WINDOW[tournament.category];
  const from = Math.floor(lo * ladder.length);
  const to = Math.max(from + 1, Math.floor(hi * ladder.length));
  const window = ladder.slice(from, to);

  const opponents: number[] = [];
  for (let i = 0; i < roundsToWin; i++) {
    // Walk up the window as the rounds advance, so the final is the toughest match.
    const depth = roundsToWin === 1 ? 0 : i / (roundsToWin - 1);
    const index = Math.round((1 - depth) * (window.length - 1));
    const spread = Math.max(1, Math.floor(window.length * 0.12));
    const from2 = Math.max(0, index - spread);
    const to2 = Math.min(window.length - 1, index + spread);
    const picked = window[rng.int(from2, to2)] ?? window[index] ?? window[0]!;
    opponents.push(picked.strength);
  }

  return opponents;
}

/** Probability our team takes a single match. */
export function winProbability(ours: number, theirs: number, mental: number): number {
  let p = 1 / (1 + Math.exp(-(ours - theirs) / LOGISTIC_SCALE));

  // Clutch: composure only decides matches that are already close (§9).
  if (Math.abs(ours - theirs) < 3) p += (mental - 70) / 400;

  return Math.max(MIN_WIN_PROB, Math.min(MAX_WIN_PROB, p));
}

/**
 * Qualifying draws are contested by players ranked *below* main-draw entry, so
 * the opposition is softer than the main draw proper — but you have to win two
 * of them at a Premier event before you have played anyone who matters.
 */
const QUALIFYING_STRENGTH_DISCOUNT = 5;

export interface SimulateTournamentOptions {
  tournament: Tournament;
  /** Our team's strength for this event. */
  strength: number;
  /** Our own `mental`, for the clutch modifier. */
  mental: number;
  partnerId: string;
  opponents: number[];
  points: PointsFile;
  rng: Rng;
  /** Our FIP rank going in — decides main draw vs qualifying. */
  rank: number;
}

/**
 * Plays one tournament out round by round and scores it.
 *
 * Below the category's direct-entry rank the player starts in qualifying. Losing
 * there means no points, no prize and a wasted trip — the entry cost is charged
 * either way, which is the whole point of the mechanic.
 */
export function simulateTournament({
  tournament,
  strength,
  mental,
  partnerId,
  opponents,
  points,
  rng,
  rank,
}: SimulateTournamentOptions): TournamentOutcome {
  const spec = points.categories[tournament.category];
  const entryRound = ROUND_INDEX[spec.firstRound];

  const direct = hasDirectEntry(spec, rank);
  const qualifyingRounds = direct ? 0 : spec.qualifyingRounds;

  let qualifyingWon = 0;
  let qualified = true;

  for (let i = 0; i < qualifyingRounds; i++) {
    // Qualifying fields sit below the main draw, so discount the opposition.
    const opponent = (opponents[0] ?? strength) - QUALIFYING_STRENGTH_DISCOUNT;
    if (!rng.chance(winProbability(strength, opponent, mental))) {
      qualified = false;
      break;
    }
    qualifyingWon++;
  }

  let matchesWon = 0;
  if (qualified) {
    for (const opponent of opponents) {
      if (!rng.chance(winProbability(strength, opponent, mental))) break;
      matchesWon++;
    }
  }

  const roundReached = Math.min(WINNER_ROUND_INDEX, entryRound + matchesWon);
  const roundKey = ROUND_LADDER[roundReached]!;

  return {
    tournamentId: tournament.id,
    tournamentName: tournament.name,
    category: tournament.category,
    band: tournament.band,
    week: tournament.week,
    year: tournament.startDate ? Number(tournament.startDate.slice(0, 4)) : 0,
    partnerId,
    roundReached,
    // Qualifying wins are real matches, but they earn no ranking credit.
    matchesWon: matchesWon + qualifyingWon,
    points: qualified ? (tournament.points[roundKey] ?? 0) : 0,
    prize: qualified ? (tournament.prize[roundKey] ?? 0) : 0,
    cost: spec.entryCost,
    hadToQualify: qualifyingRounds > 0,
    qualified,
    won: qualified && roundReached === WINNER_ROUND_INDEX,
    reachedFinal: qualified && roundReached >= WINNER_ROUND_INDEX - 1,
  };
}

/** Fatigue added by playing an event — deep runs and long travel cost more. */
export function fatigueCost(outcome: TournamentOutcome): number {
  return 3 + outcome.matchesWon * 1.6;
}

/**
 * Fatigue shed in the gap between two events. Without this, a full 17-event
 * schedule pins fatigue at 100 by mid-season and never lets go, which quietly
 * costs the player ~5 strength in every match they play.
 */
export const FATIGUE_RECOVERY_PER_WEEK = 4;

export function recoverFatigue(fatigue: number, weeksOff: number): number {
  return Math.max(0, fatigue - Math.max(0, weeksOff) * FATIGUE_RECOVERY_PER_WEEK);
}

/** Form drifts toward the result: a title heats you up, a first-round exit cools you. */
export function updateForm(form: number, outcome: TournamentOutcome, roundsToWin: number): number {
  const share = roundsToWin > 0 ? outcome.matchesWon / roundsToWin : 0;
  const target = -40 + share * 130;
  return Math.max(-50, Math.min(100, Math.round(form + (target - form) * 0.45)));
}
