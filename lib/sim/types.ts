/**
 * Sim-internal types. Everything the engine emits is a **key**, never prose —
 * the UI resolves keys against /messages/*.json (§13). Nothing in /lib/sim may
 * import React, Next, or a translation catalog.
 */
import type {
  Band,
  Category,
  Player,
  Side,
  Tour,
  Tournament,
} from "../data/types";

/** A pairing on tour — the player's own team, or an opponent's. */
export interface Pair {
  /** Plays the drive (right) side. */
  driveId: string;
  /** Plays the reves (left) side. */
  revesId: string;
  /** 0..100; NPC pairs carry a synthetic, stable value. */
  chemistry: number;
}

/** The living world a career runs inside. */
export interface World {
  tour: Tour;
  year: number;
  /** Every player the sim knows about, active or not, keyed by id. */
  players: Map<string, Player>;
  /** Ids currently competing on tour, ordered best-first by ranking points. */
  activeIds: string[];
  /** Ranking points per active NPC for the current season. */
  points: Map<string, number>;
  /** Current NPC pairings, keyed by both members' ids. */
  pairOf: Map<string, Pair>;
  /** Promises not yet debuted, keyed by the year they arrive. */
  pending: Player[];
  /** Ids that have retired, so regen never resurrects them. */
  retiredIds: Set<string>;
  /** Monotonic counter behind procedurally generated newcomer ids. */
  regenCounter: number;
}

/** Everything that shifts a team's effective strength in a given match. */
export interface StrengthBreakdown {
  /** Mean of the two players' effective OVR. */
  base: number;
  chemistry: number;
  sideBalance: number;
  form: number;
  fatigue: number;
  injury: number;
  total: number;
}

export interface TournamentEntry {
  tournament: Tournament;
  /** Opponent pairs seeded into the draw, weakest-first. */
  field: Pair[];
}

/** What one simulated tournament did to the career. */
export interface TournamentOutcome {
  tournamentId: string;
  category: Category;
  band: Band;
  week: number;
  year: number;
  partnerId: string;
  /** Index into ROUND_LADDER. */
  roundReached: number;
  matchesWon: number;
  points: number;
  /** Gross prize money; `cost` is not yet deducted. */
  prize: number;
  /** Travel and entry, charged win or lose. */
  cost: number;
  /** True when the player was below direct-entry rank and had to play qualifying. */
  hadToQualify: boolean;
  /** False when they lost in qualifying — no points, no prize, trip still paid for. */
  qualified: boolean;
  /** True when the title was won. */
  won: boolean;
  /** True when the final was reached (won or lost). */
  reachedFinal: boolean;
}

/** A season's aggregate, before it is folded into the ledger. */
export interface SeasonOutcome {
  year: number;
  age: number;
  outcomes: TournamentOutcome[];
  titles: number;
  finals: number;
  matchesWon: number;
  points: number;
  /** Net of travel and entry costs — can be negative. */
  earnings: number;
  /** Events entered from outside direct entry. */
  qualifyingAttempts: number;
  /** Of those, how many ended in the qualifying rounds. */
  qualifyingFailures: number;
  rank: number;
  /** Keys for anything notable that happened, for the season recap. */
  noteKeys: string[];
}

/** ---- Decision events (§10) — data, not prose ---- */

/** A single mechanical consequence. All fields are optional deltas. */
export interface Effect {
  ovr?: number;
  /** Applied to a named attribute, or spread across all when `attribute` is absent. */
  attribute?: string;
  attributeDelta?: number;
  potential?: number;
  form?: number;
  fatigue?: number;
  morale?: number;
  chemistry?: number;
  money?: number;
  rankingPoints?: number;
  /** Weeks of injury inflicted. */
  injuryWeeks?: number;
  injurySeverity?: number;
  /** Multiplier applied to growth from here on. */
  coachBonus?: number;
  physioBonus?: number;
  /** Seasons of competition ban. */
  banSeasons?: number;
  /** Switch to the other side, applying the §6 penalty. */
  switchSide?: boolean;
  /** Move to a different circuit band. */
  band?: Band;
  /** Break up with the current partner. */
  leavePartner?: boolean;
  /** Accept a specific partner (resolved by the decision that offered them). */
  takePartnerId?: string;
}

/** One possible resolution of an option — outcomes are probabilistic (§10). */
export interface EventOutcome {
  /** Relative likelihood within the option. */
  weight: number;
  /** i18n key for the "what happened" line. */
  resultKey: string;
  effects: Effect;
}

export type TagTone = "good" | "bad" | "neutral";

/** A consequence tag rendered on an option card. */
export interface OptionTag {
  /** i18n key, e.g. "tag.ovr_down". */
  key: string;
  tone: TagTone;
  /** Interpolated into the tag text, e.g. { value: 8 }. */
  values?: Record<string, string | number>;
}

export interface EventOption {
  id: string;
  /** i18n key for the option's label. */
  labelKey: string;
  tags: OptionTag[];
  outcomes: EventOutcome[];
  /**
   * Partner-market options carry the prospective partner and their band, so the
   * card can show the tier label (`Premier P1` / `FIP Gold` / ...) (§5).
   */
  partnerId?: string;
  partnerBand?: Band;
  /** True when taking this option forces a side switch. */
  requiresSideSwitch?: boolean;
}

export type EventTiming = "in_season" | "end_of_season";

/** A decision presented to the player. Title/description are i18n keys. */
export interface DecisionCard {
  id: string;
  /** Catalog entry this was built from. */
  eventId: string;
  timing: EventTiming;
  titleKey: string;
  descriptionKey: string;
  /** Interpolated into title/description, e.g. { partner: "Marta Ortega" }. */
  values?: Record<string, string | number>;
  options: EventOption[];
}

/** A catalog entry (§10): data with a context gate and a weight. */
export interface EventDefinition {
  id: string;
  timing: EventTiming;
  /** Base likelihood inside the weighted pool. */
  weight: number;
  /** Fires at most once per career. */
  once?: boolean;
  /** Context gate — the event is only eligible when this returns true. */
  eligible?: (ctx: EventContext) => boolean;
  /** Multiplies `weight` given the current context (§3's context weighting). */
  weightFor?: (ctx: EventContext) => number;
  /** Builds the card. Receives context so options can name a real partner. */
  build: (ctx: EventContext) => DecisionCard;
}

/** Read-only view of the career handed to event gates and builders. */
export interface EventContext {
  career: {
    age: number;
    ovr: number;
    band: Band;
    rank: number;
    season: number;
    year: number;
    form: number;
    fatigue: number;
    morale: number;
    chemistry: number;
    earnings: number;
    injured: boolean;
    partnerId: string | null;
    side: Side;
    naturalSide: Side;
    hasCoach: boolean;
    hasSponsor: boolean;
    firedEventIds: string[];
    seasonTitles: number;
    /** Rank movement vs the previous season; negative means improving. */
    rankDelta: number;
    /** Events this season the player had to qualify for. */
    qualifyingAttempts: number;
    /** Of those, how many they failed to get out of. */
    qualifyingFailures: number;
    /** Season prize money minus travel and entry — negative means losing money. */
    seasonNet: number;
    /** Decisions this career that backfired (injury, lost chemistry, a ban). */
    poorDecisions: number;
  };
  world: World;
  /** Resolves a player id to their display name — the one place prose leaks in. */
  nameOf: (id: string) => string;
}

/** The result of applying a chosen option. */
export interface DecisionResolution {
  eventId: string;
  optionId: string;
  resultKey: string;
  effects: Effect;
}

/** One entry in the career log the UI streams into the ledger. */
export type CareerLogEntry =
  | { kind: "tournament"; outcome: TournamentOutcome }
  | { kind: "season"; outcome: SeasonOutcome }
  | { kind: "decision"; card: DecisionCard }
  | { kind: "resolution"; resolution: DecisionResolution }
  | { kind: "partner_change"; fromId: string | null; toId: string | null; year: number }
  | { kind: "award"; type: string; year: number }
  | { kind: "retired"; reason: string; year: number };

export type { Pair as NpcPair };
