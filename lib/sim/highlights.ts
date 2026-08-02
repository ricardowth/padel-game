/**
 * Season highlights — the bit that makes a career feel like it happened.
 *
 * The sim already produces a rich season (titles, finals, rank movement,
 * qualifying failures, money) and then throws almost all of it away: the ledger
 * gains a row and the player is handed the next decision. Nothing tells them
 * they just won their first title, or cracked the top ten, or that the rival
 * they started alongside has pulled away.
 *
 * This turns a finished season into at most three lines worth reading. Like
 * everything else in /lib/sim it emits **keys**, never prose — the only literal
 * strings that escape are real tournament and player names.
 */
import { WINNER_ROUND_INDEX } from "../data/points";
import type { Category } from "../data/types";
import type { TournamentOutcome } from "./types";

export interface Highlight {
  /** i18n key under `season.highlight.*`. */
  key: string;
  values?: Record<string, string | number>;
  /** Drives the accent colour in the UI. */
  tone: "good" | "bad" | "neutral";
}

/** Categories worth naming in a recap, best first. */
const CATEGORY_PRESTIGE: Category[] = [
  "major",
  "finals",
  "p1",
  "p2",
  "platinum",
  "gold",
  "silver",
  "bronze",
];

const prestige = (category: Category) => {
  const index = CATEGORY_PRESTIGE.indexOf(category);
  return index === -1 ? CATEGORY_PRESTIGE.length : index;
};

/** Milestone ranks worth calling out, hardest first. */
const RANK_MILESTONES = [1, 3, 10, 25, 50, 100];

export interface HighlightInput {
  outcomes: TournamentOutcome[];
  rank: number;
  previousRank: number;
  /** Best rank reached before this season; 0 if never ranked. */
  previousBestRank: number;
  titles: number;
  /** Titles at platinum level or above. */
  bigTitles: number;
  /** Career titles *before* this season, to spot the first one. */
  careerTitlesBefore: number;
  qualifyingAttempts: number;
  qualifyingFailures: number;
  /** Prize money minus travel for the season. */
  net: number;
  banned: boolean;
  /** Display name of the career-long rival, if they are still active. */
  rivalName?: string;
  /** Where the rival finished this season. */
  rivalRank?: number;
  /** Whether the player finished above the rival last season. */
  wasAheadOfRival?: boolean;
}

/** The single most impressive result of the season, if there was one. */
function bestResult(outcomes: TournamentOutcome[]): TournamentOutcome | null {
  const wins = outcomes.filter((o) => o.won);
  if (wins.length > 0) {
    return wins.reduce((a, b) => (prestige(b.category) < prestige(a.category) ? b : a));
  }

  const finals = outcomes.filter((o) => o.roundReached === WINNER_ROUND_INDEX - 1);
  if (finals.length > 0) {
    return finals.reduce((a, b) => (prestige(b.category) < prestige(a.category) ? b : a));
  }

  return null;
}

/**
 * Builds the recap, most interesting first, capped at three lines so it stays
 * a beat rather than a report.
 */
export function seasonHighlights(input: HighlightInput): Highlight[] {
  const out: Highlight[] = [];

  if (input.banned) {
    out.push({ key: "season.highlight.banned", tone: "bad" });
    return out;
  }

  // 1. Milestones first — these are the moments people replay for.
  if (input.careerTitlesBefore === 0 && input.titles > 0) {
    const first = bestResult(input.outcomes);
    out.push({
      key: "season.highlight.first_title",
      values: { tournament: first?.tournamentName ?? "" },
      tone: "good",
    });
  }

  const milestone = RANK_MILESTONES.find(
    (m) =>
      input.rank > 0 &&
      input.rank <= m &&
      (input.previousBestRank === 0 || input.previousBestRank > m),
  );
  if (milestone !== undefined) {
    out.push({
      key: milestone === 1 ? "season.highlight.world_number_one" : "season.highlight.reached_top",
      values: { rank: milestone },
      tone: "good",
    });
  }

  // 2. The season's defining result.
  const best = bestResult(input.outcomes);
  if (best && out.length < 3) {
    out.push({
      key: best.won ? "season.highlight.title" : "season.highlight.runner_up",
      values: {
        tournament: best.tournamentName ?? "",
        titles: input.titles,
      },
      tone: best.won ? "good" : "neutral",
    });
  } else if (!best && out.length < 3) {
    out.push({ key: "season.highlight.nothing_to_show", tone: "bad" });
  }

  // 3. The rival thread — a career-long comparison you did not choose.
  if (input.rivalName && input.rivalRank && input.rank > 0 && out.length < 3) {
    const ahead = input.rank < input.rivalRank;
    if (ahead && input.wasAheadOfRival === false) {
      out.push({
        key: "season.highlight.rival_passed",
        values: { rival: input.rivalName },
        tone: "good",
      });
    } else if (!ahead && input.wasAheadOfRival === true) {
      out.push({
        key: "season.highlight.rival_lost",
        values: { rival: input.rivalName },
        tone: "bad",
      });
    }
  }

  // 4. Pain worth naming, if there is still room.
  if (out.length < 3) {
    if (input.qualifyingAttempts >= 3 && input.qualifyingFailures >= input.qualifyingAttempts / 2) {
      out.push({
        key: "season.highlight.qualifying_woes",
        values: { failures: input.qualifyingFailures, attempts: input.qualifyingAttempts },
        tone: "bad",
      });
    } else if (input.net < 0) {
      out.push({
        key: "season.highlight.lost_money",
        values: { amount: Math.round(-input.net) },
        tone: "bad",
      });
    }
  }

  // 5. Movement, as a closer.
  if (out.length < 3 && input.previousRank > 0 && input.rank > 0) {
    const climbed = input.previousRank - input.rank;
    if (climbed >= 15) {
      out.push({
        key: "season.highlight.climbed",
        values: { places: climbed, rank: input.rank },
        tone: "good",
      });
    } else if (climbed <= -15) {
      out.push({
        key: "season.highlight.slipped",
        values: { places: -climbed, rank: input.rank },
        tone: "bad",
      });
    }
  }

  return out.slice(0, 3);
}
