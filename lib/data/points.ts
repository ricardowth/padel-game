/**
 * Types + helpers for /data/points.json (the points-by-round-by-category table).
 */
import type { Band, Category, PointsTable } from "./types";

export const ROUND_LADDER = [
  "r64",
  "r32",
  "r16",
  "quarter",
  "semi",
  "final",
  "winner",
] as const;

export type Round = (typeof ROUND_LADDER)[number];

/** Index into ROUND_LADDER — this is `TournamentResult.roundReached`. */
export const ROUND_INDEX = Object.fromEntries(
  ROUND_LADDER.map((round, i) => [round, i]),
) as Record<Round, number>;

export const WINNER_ROUND_INDEX = ROUND_LADDER.length - 1;
/** Reaching the final without winning it. */
export const FINAL_ROUND_INDEX = WINNER_ROUND_INDEX - 1;

export interface CategorySpec {
  band: Band;
  drawSize: number;
  firstRound: Round;
  winnerPoints: number;
  /** A single player's share, in EUR. */
  winnerPrize: number;
  /**
   * FIP rank that earns direct main-draw entry. Below it you play qualifying
   * first — the "previa" — and losing there scores nothing at all.
   */
  directEntryRank: number;
  /** Matches to win in qualifying before the main draw. */
  qualifyingRounds: number;
  /**
   * One player's travel and entry bill, charged whether you win or lose. This is
   * what makes chasing Premier events from outside the top 64 cost real money.
   */
  entryCost: number;
}

/** Does this player rank straight into the main draw? */
export function hasDirectEntry(spec: CategorySpec, rank: number): boolean {
  // An unranked player (rank 0, before their first season) qualifies for nothing.
  if (rank <= 0) return spec.directEntryRank >= 100000;
  return rank <= spec.directEntryRank;
}

export interface PointsFile {
  roundLadder: readonly Round[];
  roundShares: Record<Round, number>;
  prizeShares: Record<Round, number>;
  categories: Record<Category, CategorySpec>;
}

/** The rounds a category's draw actually contains, earliest exit first. */
export function roundsFor(spec: CategorySpec): Round[] {
  return ROUND_LADDER.slice(ROUND_INDEX[spec.firstRound]);
}

/** Points awarded for each reachable round. */
export function pointsTableFor(spec: CategorySpec, file: PointsFile): PointsTable {
  const table: PointsTable = {};
  for (const round of roundsFor(spec)) {
    table[round] = Math.round(spec.winnerPoints * file.roundShares[round]);
  }
  return table;
}

/** Prize money (one player's share, EUR) for each reachable round. */
export function prizeTableFor(spec: CategorySpec, file: PointsFile): PointsTable {
  const table: PointsTable = {};
  for (const round of roundsFor(spec)) {
    table[round] = Math.round(spec.winnerPrize * file.prizeShares[round]);
  }
  return table;
}
