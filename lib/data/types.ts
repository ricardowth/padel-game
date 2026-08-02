/**
 * Core data schemas (§12). The static JSON in /data is generated to match these
 * exactly; the sim and UI both read through them.
 */

export type Side = "drive" | "reves";
export type Tour = "men" | "women";
export type Band = "developmental" | "professional" | "elite";
export type Category =
  | "bronze"
  | "silver"
  | "gold"
  | "platinum"
  | "p2"
  | "p1"
  | "major"
  | "finals";
export type Playstyle = "power" | "playmaker" | "counter" | "allcourt";

export const ATTRIBUTE_KEYS = [
  "remate",
  "volea",
  "bandeja",
  "vibora",
  "defensa",
  "pared",
  "velocidad",
  "mental",
] as const;

export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

export interface Attributes {
  /** Power finishing overhead. */
  remate: number;
  /** Net control, both volleys. */
  volea: number;
  /** The signature defensive overhead / tempo control. */
  bandeja: number;
  /** Aggressive slice overhead. */
  vibora: number;
  /** Lobs, retrieving, patience. */
  defensa: number;
  /** Playing balls off the back/side glass. */
  pared: number;
  /** Court coverage & reaction. */
  velocidad: number;
  /** Consistency, clutch, pressure. */
  mental: number;
}

export interface Player {
  id: string;
  name: string;
  /** ISO 3166-1 alpha-2, for flag rendering. */
  country: string;
  tour: Tour;
  naturalSide: Side;
  currentSide: Side;
  playstyle: Playstyle;
  attributes: Attributes;
  /** Hidden OVR cap. */
  potential: number;
  age: number;
  /** Derived from attributes + currentSide. */
  ovr: number;
  /** Real FIP player vs regen/newcomer. */
  isReal: boolean;
  /** Promises only — the in-game year they enter the active pool. */
  debutYear?: number;

  /** ---- Provenance (not used by the sim; keeps the JSON auditable/tunable) ---- */
  source?: PlayerSource;
}

export interface PlayerSource {
  /** FIP player id, e.g. "P000010". */
  fipId: string;
  /** The full legal name as FIP publishes it, before shortening for display. */
  fullName?: string;
  /** FIP's own alpha-3 country code (IOC-style), e.g. "ESP". */
  fipCountry: string;
  fipRank: number;
  fipPoints: number;
  /** True when FIP publishes the player's court side; false when inferred. */
  sideKnown: boolean;
  /** True when the age comes from a published birth date. */
  ageKnown: boolean;
  birthDate?: string;
  heightM?: number;
  profileUrl?: string;
}

export interface PointsTable {
  /** Points awarded by round reached, keyed by the round labels in rounds.json order. */
  [round: string]: number;
}

export interface Tournament {
  id: string;
  name: string;
  city: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  category: Category;
  band: Band;
  /** ISO week of the season, 1..53. */
  week: number;
  /** Ranking points by round reached. */
  points: PointsTable;
  /** Prize money (one player's share, EUR) by round reached. */
  prize: PointsTable;
  /** Tours that contest this event; the sim only ever reads the career's own. */
  tours: Tour[];
  /** ISO dates from the real calendar — kept for flavour and calendar rotation. */
  startDate?: string;
  endDate?: string;
}

export interface TournamentResult {
  tournamentId: string;
  /** Kept per result so the final trophy case can group titles by level. */
  category: Category;
  /** Display name, for the season feed and the trophy case. */
  tournamentName: string;
  roundReached: number;
  /** Matches actually won at this event — feeds the partnership aggregates. */
  matchesWon: number;
  points: number;
  /** Gross prize money. */
  prize: number;
  /** Travel and entry for the trip, charged win or lose. */
  cost: number;
  partnerId: string;
  year: number;
}

export interface Injury {
  /** i18n key for the injury type. */
  key: string;
  /** Weeks remaining. */
  weeks: number;
  /** OVR dampening while recovering. */
  severity: number;
}

export interface Sponsor {
  id: string;
  /** i18n key. */
  key: string;
  perSeason: number;
  /** Expectations attached to the deal, if any. */
  demandsTop?: number;
}

export interface Award {
  type: "fip_no1" | "major" | "best_smash" | "breakout" | (string & {});
  year: number;
}

export interface SeasonSummary {
  age: number;
  year: number;
  partnerId: string | null;
  band: Band;
  side: Side;
  ovr: number;
  titles: number;
  finals: number;
  rank: number;
  earnings: number;
  /** True when the side was switched into this season (ledger shows `*`). */
  sidePenalised: boolean;
}

/** Computed by grouping results by partnerId across the whole career. */
export interface PartnershipRecord {
  partnerId: string;
  seasonsTogether: number;
  titles: number;
  finals: number;
  matchesWon: number;
  firstYear: number;
  lastYear: number;
}

export type Pace = "story" | "quick";

/** Legacy tier headline on the final card (§14). */
export type LegacyTier = "journeyman" | "contender" | "champion" | "legend";

/**
 * The side-switch penalty (§6): an immediate hit that decays over ~3 seasons but
 * never fully clears, so switching is a real sacrifice rather than free.
 */
export interface SidePenalty {
  /** Current OVR points deducted. */
  current: number;
  /** The floor it decays toward — a small permanent cost. */
  floor: number;
  /** Seasons of decay still to run. */
  seasonsLeft: number;
}

export interface CareerState {
  seed: string;
  you: Player;
  /** Chosen at creation; a career never leaves its tour (§5). */
  tour: Tour;
  pace: Pace;
  partnerId: string | null;
  /** 0..100. */
  chemistry: number;
  band: Band;
  season: number;
  year: number;
  /** Week within the season, 1..52. */
  week: number;
  rankingPoints: number;
  /** Year-end FIP rank; 0 until the first season completes. */
  rank: number;
  /** Best 22 feed the ranking. */
  results: TournamentResult[];
  form: number;
  fatigue: number;
  injury: Injury | null;
  morale: number;
  earnings: number;
  sponsors: Sponsor[];
  /** Per-season rows for the ledger. */
  history: SeasonSummary[];
  /** Aggregates for the final "defining partnerships" card. */
  partnerships: PartnershipRecord[];
  awards: Award[];
  worlds: { country: string; apps: number; golds: number };

  /** ---- Sim bookkeeping ---- */
  sidePenalty: SidePenalty | null;
  /** Career totals, cached so the UI need not re-scan every result. */
  titles: number;
  /**
   * Titles won at Platinum level or above. Raw title count is a poor measure of
   * a career — farming Bronze can pile up 60 of them — so this is what the
   * legacy tier actually weighs.
   */
  bigTitles: number;
  /**
   * Decisions that backfired — an injury, lost chemistry, a ban. Partners lose
   * patience with a pattern of them (see `breakupChance`).
   */
  poorDecisions: number;
  /** Best rank ever reached; 0 until the first season is scored. */
  bestRank: number;
  /**
   * A player picked at creation who started at the same level. They are never
   * mentioned unless the two careers cross, which is what makes it land.
   */
  rivalId: string | null;
  finals: number;
  matchesWon: number;
  weeksAtNo1: number;
  /** Seasons left on a doping ban (§10); blocks all competition while > 0. */
  banSeasonsLeft: number;
  /** Multiplies growth (a coach) and divides injury risk (a physio). */
  coachBonus: number;
  physioBonus: number;
  retired: boolean;
  retiredReason?: "age" | "ban" | "decline";
  /** i18n keys for events already fired, so one-shot events do not repeat. */
  firedEventIds: string[];
}

/** Shape of /data/players.*.json and /data/promises.*.json. */
export interface PlayerPoolFile {
  tour: Tour;
  kind: "senior" | "promise";
  /** Ranking week the snapshot was taken from. */
  source: { provider: string; year: number; week: number; fetchedAt: string };
  players: Player[];
}

/** Shape of /data/calendar.*.json. */
export interface CalendarFile {
  id: string;
  year: number;
  source: { provider: string; note: string };
  tournaments: Tournament[];
}
