/**
 * The career orchestrator — creates a player, runs 16 -> 35, and stops whenever
 * a decision needs the human.
 *
 * Exposed as a stepper rather than a single `runCareer()` because the UI has to
 * pause mid-season on a pop-up: `advance()` runs until a card is pending or the
 * career ends, and `choose()` resumes it. A headless caller just loops the two.
 */
import type { TourData } from "../data/load";
import { ROUND_LADDER, WINNER_ROUND_INDEX, type PointsFile } from "../data/points";
import {
  ATTRIBUTE_KEYS,
  type Attributes,
  type AttributeKey,
  type Award,
  type Band,
  type CareerState,
  type Category,
  type LegacyTier,
  type Pace,
  type PartnershipRecord,
  type Player,
  type Playstyle,
  type Side,
  type Tour,
  type Tournament,
} from "../data/types";
import {
  pickEndOfSeasonEvent,
  resolveOption,
  rollInSeasonEvent,
} from "./events";
import { rotateCalendar } from "./calendar";
import { ageOneSeason, nudgeAttribute, nudgeOvr } from "./growth";
import {
  buildField,
  fatigueCost,
  recoverFatigue,
  simulateTournament,
  updateForm,
} from "./match";
import { clampOvr, computeOvr, normaliseToOvr, PLAYSTYLE_BIAS, SIDE_BIAS } from "./ovr";
import {
  beginSideSwitch,
  buildOffers,
  careerEffectiveOvr,
  careerTeamStrength,
  decaySidePenalty,
  partnerLeaves,
  STARTING_CHEMISTRY,
  updateChemistry,
  bandForRank,
} from "./partners";
import { clonePlayer, createWorld, effectiveOvr, rescoreLadder, repair, sortLadder } from "./pool";
import { advanceWorld, buildNameBank, type NameBank } from "./regen";
import { createRng, type Rng } from "./rng";
import {
  BAND_CATEGORIES,
  computeAwards,
  rankAmong,
  seasonQuality,
  selectSchedule,
  totalsFrom,
} from "./season";
import type {
  CareerLogEntry,
  DecisionCard,
  DecisionResolution,
  Effect,
  EventContext,
  EventOption,
  OptionTag,
  SeasonOutcome,
  TournamentOutcome,
  World,
} from "./types";

/** Categories whose titles count toward a career's real standing. */
const BIG_TITLE_CATEGORIES = new Set<Category>(["platinum", "p2", "p1", "major", "finals"]);

/** Ranked worst-to-best, so band moves can be compared. */
const BAND_ORDER: Record<Band, number> = { developmental: 0, professional: 1, elite: 2 };

export const START_AGE = 16;
export const END_AGE = 35;
/** Season weeks the player is actually available to compete. */
const SEASON_WEEKS = 48;

export interface CreatePlayerInput {
  name: string;
  country: string;
  tour: Tour;
  side: Side;
  playstyle: Playstyle;
  /** Left-handers suit the reves side and are prized (§14). */
  handedness: "left" | "right";
}

export interface StartCareerOptions {
  data: TourData;
  seed: string;
  pace: Pace;
  input: CreatePlayerInput;
}

/** Starting attribute budget for a 16-year-old — deliberately raw. */
const STARTING_OVR = 44;

/**
 * Builds the player's starting profile. Side, playstyle and handedness all feed
 * the spread, which is what makes the creator's live OVR preview meaningful.
 */
export function createPlayer(input: CreatePlayerInput, rng: Rng): Player {
  const shaped = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) {
    shaped[key] =
      STARTING_OVR + SIDE_BIAS[input.side][key] + PLAYSTYLE_BIAS[input.playstyle][key] + rng.normal(0, 2.5);
  }

  // A left-hander on the reves wall covers the middle naturally; on the drive
  // they are fighting their own geometry.
  const handednessFit = input.handedness === "left" ? (input.side === "reves" ? 2 : -1) : 0;
  const target = clampOvr(STARTING_OVR + handednessFit);
  const attributes = normaliseToOvr(shaped, input.side, target);

  return {
    id: "YOU",
    name: input.name,
    country: input.country,
    tour: input.tour,
    naturalSide: input.side,
    currentSide: input.side,
    playstyle: input.playstyle,
    attributes,
    potential: clampOvr(target + rng.range(22, 46)),
    age: START_AGE,
    ovr: computeOvr(attributes, input.side),
    isReal: false,
  };
}

/** The starting partner: someone at your level, on the other wall (§5). */
function pickStartingPartner(world: World, you: Player, rng: Rng): Player | null {
  const candidates: Player[] = [];
  for (const id of world.activeIds) {
    const player = world.players.get(id);
    if (!player) continue;
    if (player.naturalSide === you.naturalSide) continue;
    if (Math.abs(effectiveOvr(player) - you.ovr) <= 12) candidates.push(player);
  }

  if (candidates.length === 0) {
    // Nobody close — take the weakest available on the other side.
    for (const id of world.activeIds) {
      const player = world.players.get(id);
      if (player && player.naturalSide !== you.naturalSide) candidates.push(player);
    }
    candidates.sort((a, b) => effectiveOvr(a) - effectiveOvr(b));
    return candidates[0] ?? null;
  }

  return rng.pick(candidates);
}

export interface AdvanceResult {
  log: CareerLogEntry[];
  /** Set when the engine is waiting on the human. */
  pending: DecisionCard | null;
  done: boolean;
}

export class CareerEngine {
  readonly state: CareerState;
  readonly world: World;

  private readonly data: TourData;
  private readonly points: PointsFile;
  private readonly rng: Rng;
  private readonly nameBank: NameBank;
  /** The year the scraped calendar describes — year 1 plays it verbatim. */
  private readonly baseYear: number;

  /** Non-null while waiting for `choose()`. */
  private pending: DecisionCard | null = null;
  /** What the last `choose()` actually produced, for the outcome panel. */
  private lastResolutionValue: DecisionResolution | null = null;
  /** Set when the pending card is the partner market, so we can apply the swap. */
  private pendingOffers: Map<string, { partnerId: string; band: Band; sideSwitch: boolean }> =
    new Map();

  private schedule: Tournament[] = [];
  private scheduleIndex = 0;
  private seasonOutcomes: TournamentOutcome[] = [];
  /** Week of the last event played, so fatigue can recover in the gaps. */
  private lastEventWeek = 0;
  private previousRank = 0;
  private log: CareerLogEntry[] = [];
  private endOfSeasonQueue: DecisionCard[] = [];
  private seasonStarted = false;
  /** Guards `closeSeason()` — it scores the ladder and writes a ledger row, so
   *  re-entering it after a decision would duplicate the whole season. */
  private seasonClosed = false;

  constructor(options: StartCareerOptions) {
    this.data = options.data;
    this.points = options.data.points;
    this.rng = createRng(options.seed);

    const startYear = options.data.seniors.source.year;
    this.baseYear = startYear;
    this.world = createWorld({ data: options.data, rng: this.rng, year: startYear });
    this.nameBank = buildNameBank(this.world.players.values());

    const you = createPlayer(options.input, this.rng);
    this.world.players.set(you.id, clonePlayer(you));

    const partner = pickStartingPartner(this.world, you, this.rng);

    this.state = {
      seed: options.seed,
      you,
      tour: options.input.tour,
      pace: options.pace,
      partnerId: partner?.id ?? null,
      chemistry: STARTING_CHEMISTRY,
      band: "developmental",
      season: 1,
      year: startYear,
      week: 1,
      rankingPoints: 0,
      rank: 0,
      results: [],
      form: 0,
      fatigue: 0,
      injury: null,
      morale: 60,
      earnings: 0,
      sponsors: [],
      history: [],
      partnerships: [],
      awards: [],
      worlds: { country: options.input.country, apps: 0, golds: 0 },
      sidePenalty: null,
      titles: 0,
      bigTitles: 0,
      finals: 0,
      matchesWon: 0,
      weeksAtNo1: 0,
      banSeasonsLeft: 0,
      coachBonus: 1,
      physioBonus: 1,
      retired: false,
      firedEventIds: [],
    };
  }

  get pendingDecision(): DecisionCard | null {
    return this.pending;
  }

  /** The outcome of the most recent choice — the UI shows this before moving on. */
  get lastResolution(): DecisionResolution | null {
    return this.lastResolutionValue;
  }

  /** Name lookup for event copy — the only place the engine touches prose. */
  private nameOf = (id: string): string => this.world.players.get(id)?.name ?? "";

  private context(): EventContext {
    const rankDelta = this.previousRank > 0 ? this.state.rank - this.previousRank : 0;
    return {
      career: {
        age: this.state.you.age,
        ovr: careerEffectiveOvr(this.state),
        band: this.state.band,
        rank: this.state.rank,
        season: this.state.season,
        year: this.state.year,
        form: this.state.form,
        fatigue: this.state.fatigue,
        morale: this.state.morale,
        chemistry: this.state.chemistry,
        earnings: this.state.earnings,
        injured: this.state.injury !== null,
        partnerId: this.state.partnerId,
        side: this.state.you.currentSide,
        naturalSide: this.state.you.naturalSide,
        hasCoach: this.state.coachBonus > 1,
        hasSponsor: this.state.sponsors.length > 0,
        firedEventIds: this.state.firedEventIds,
        seasonTitles: this.seasonOutcomes.filter((o) => o.won).length,
        rankDelta,
      },
      world: this.world,
      nameOf: this.nameOf,
    };
  }

  /**
   * Runs the career forward until a decision is pending or it ends.
   * Everything between two calls is deterministic given the seed.
   */
  advance(): AdvanceResult {
    this.log = [];

    while (!this.state.retired && !this.pending) {
      if (!this.seasonStarted) this.startSeason();

      // Work through this season's schedule, rolling for pop-ups between events.
      while (this.scheduleIndex < this.schedule.length) {
        const tournament = this.schedule[this.scheduleIndex]!;

        const card = this.rollWeeklyEvent(tournament.week);
        if (card) {
          this.pending = card;
          return { log: this.log, pending: card, done: false };
        }

        this.playTournament(tournament);
        this.scheduleIndex++;
      }

      // Season over — score it once, then work through the end-of-season cards.
      if (!this.seasonClosed) {
        this.closeSeason();
        this.seasonClosed = true;
      }

      const next = this.endOfSeasonQueue.shift();
      if (next) {
        this.pending = next;
        return { log: this.log, pending: next, done: false };
      }

      this.rolloverSeason();
    }

    return { log: this.log, pending: this.pending, done: this.state.retired };
  }

  /** Applies the human's choice and clears the pending card. */
  choose(optionId: string): void {
    const card = this.pending;
    if (!card) return;

    const chosen = card.options.find((o) => o.id === optionId) ?? card.options[0];
    if (!chosen) return;

    const outcome = resolveOption(chosen, this.rng);

    // Partner-market options carry the partner on the option, not the effect.
    const offer = this.pendingOffers.get(chosen.id);
    const effects: Effect = { ...outcome.effects };
    if (offer) {
      effects.takePartnerId = offer.partnerId;
      if (offer.sideSwitch) effects.switchSide = true;
    }

    this.applyEffects(effects, chosen);

    this.state.firedEventIds.push(card.eventId);

    const resolution: DecisionResolution = {
      eventId: card.eventId,
      optionId: chosen.id,
      resultKey: outcome.resultKey,
      effects,
    };
    this.lastResolutionValue = resolution;
    this.log.push({ kind: "resolution", resolution });

    this.pending = null;
    this.pendingOffers.clear();
  }

  /* ---------------- season lifecycle ---------------- */

  private startSeason(): void {
    this.seasonStarted = true;
    this.seasonOutcomes = [];
    this.scheduleIndex = 0;
    this.lastEventWeek = 0;

    // A ban means no competition at all this season (§10).
    if (this.state.banSeasonsLeft > 0) {
      this.schedule = [];
      return;
    }

    // Year 1 is the real 2026 calendar; later years are rotated from it (§8).
    const calendar = rotateCalendar(
      this.data.tournaments,
      this.state.year,
      this.baseYear,
      this.rng,
    );

    const unavailableWeeks = new Set<number>();
    if (this.state.injury) {
      for (let i = 0; i < this.state.injury.weeks; i++) {
        unavailableWeeks.add(((this.state.week + i - 1) % SEASON_WEEKS) + 1);
      }
    }

    this.schedule = selectSchedule({
      tournaments: calendar,
      band: this.state.band,
      rank: this.state.rank,
      rng: this.rng,
      unavailableWeeks,
    });
  }

  private rollWeeklyEvent(week: number): DecisionCard | null {
    this.state.week = week;
    return rollInSeasonEvent(this.context(), this.rng, this.state.pace);
  }

  private playTournament(tournament: Tournament): void {
    const partnerId = this.state.partnerId;
    if (!partnerId) return;

    // Rest between events before anything is measured — a schedule with gaps in
    // it should genuinely leave the player fresher than a back-to-back one.
    const weeksOff = this.lastEventWeek === 0 ? 2 : tournament.week - this.lastEventWeek;
    this.state.fatigue = recoverFatigue(this.state.fatigue, weeksOff);
    this.lastEventWeek = tournament.week;

    const strength = careerTeamStrength(this.state, this.world).total;
    const excluded = new Set<string>([this.state.you.id, partnerId]);
    const opponents = buildField(tournament, this.world, this.points, this.rng, excluded);

    const outcome = simulateTournament({
      tournament,
      strength,
      mental: this.state.you.attributes.mental,
      partnerId,
      opponents,
      points: this.points,
      rng: this.rng,
    });
    outcome.year = this.state.year;

    this.seasonOutcomes.push(outcome);
    this.state.results.push({
      tournamentId: outcome.tournamentId,
      roundReached: outcome.roundReached,
      matchesWon: outcome.matchesWon,
      points: outcome.points,
      prize: outcome.prize,
      partnerId,
      year: this.state.year,
    });

    this.state.earnings += outcome.prize;
    this.state.matchesWon += outcome.matchesWon;
    if (outcome.won) {
      this.state.titles++;
      if (BIG_TITLE_CATEGORIES.has(outcome.category)) this.state.bigTitles++;
    }
    if (outcome.reachedFinal) this.state.finals++;

    this.state.fatigue = Math.min(100, this.state.fatigue + fatigueCost(outcome) * this.state.physioBonus);
    this.state.form = updateForm(this.state.form, outcome, opponents.length);

    // Injuries tick down as the weeks pass.
    if (this.state.injury) {
      this.state.injury.weeks -= 1;
      if (this.state.injury.weeks <= 0) this.state.injury = null;
    }

    this.log.push({ kind: "tournament", outcome });
  }

  private closeSeason(): void {
    const totals = totalsFrom(this.seasonOutcomes);
    this.previousRank = this.state.rank;

    // Score the NPC ladder for this season, then slot the player into it.
    rescoreLadder(this.world, this.rng);
    this.state.rankingPoints = totals.points;
    this.state.rank = rankAmong(this.world, totals.points);
    this.world.points.set(this.state.you.id, totals.points);
    if (!this.world.activeIds.includes(this.state.you.id)) {
      this.world.activeIds.push(this.state.you.id);
    }
    sortLadder(this.world);

    if (this.state.rank === 1) this.state.weeksAtNo1 += 52;

    const awards = computeAwards({
      you: this.state.you,
      world: this.world,
      outcomes: this.seasonOutcomes,
      rank: this.state.rank,
      previousRank: this.previousRank,
      age: this.state.you.age,
      year: this.state.year,
    });
    for (const award of awards) {
      this.state.awards.push(award);
      this.log.push({ kind: "award", type: award.type, year: award.year });
    }

    // Chemistry moves on the season's evidence.
    if (this.state.partnerId) {
      const winRate = totals.matchesPlayed > 0 ? totals.matchesWon / totals.matchesPlayed : 0;
      this.state.chemistry = updateChemistry(
        this.state.chemistry,
        totals.titles,
        totals.finals,
        winRate,
      );
    }

    const seasonOutcome: SeasonOutcome = {
      year: this.state.year,
      age: this.state.you.age,
      outcomes: this.seasonOutcomes,
      titles: totals.titles,
      finals: totals.finals,
      matchesWon: totals.matchesWon,
      points: totals.points,
      earnings: totals.earnings,
      rank: this.state.rank,
      noteKeys: this.state.banSeasonsLeft > 0 ? ["season.note.banned"] : [],
    };

    this.state.history.push({
      age: this.state.you.age,
      year: this.state.year,
      partnerId: this.state.partnerId,
      band: this.state.band,
      side: this.state.you.currentSide,
      ovr: careerEffectiveOvr(this.state),
      titles: totals.titles,
      finals: totals.finals,
      rank: this.state.rank,
      earnings: totals.earnings,
      sidePenalised: (this.state.sidePenalty?.seasonsLeft ?? 0) > 0,
    });

    this.log.push({ kind: "season", outcome: seasonOutcome });

    this.queueEndOfSeasonDecisions(totals, seasonQuality(totals, this.state.rank, this.previousRank));
  }

  /**
   * §5's marquee card. Offers are real players drawn from the level the season
   * earned; "stay" always exists, and a partner may walk out on you first.
   */
  private queueEndOfSeasonDecisions(
    totals: { titles: number },
    quality: number,
  ): void {
    if (this.state.you.age >= END_AGE) return;

    const ctx = this.context();

    // Does the current partner leave first?
    const partnerRank = this.state.partnerId
      ? this.world.activeIds.indexOf(this.state.partnerId) + 1
      : 0;
    const dumped =
      this.state.partnerId !== null &&
      partnerRank > 0 &&
      partnerLeaves(this.state, partnerRank, this.state.rank, this.rng);

    const offers = buildOffers({
      career: this.state,
      world: this.world,
      rng: this.rng,
      rank: this.state.rank,
      seasonQuality: quality,
      count: 3,
    });

    const options: EventOption[] = [];
    this.pendingOffers.clear();

    offers.forEach((offer, index) => {
      const optionId = `offer_${index}`;
      const tags: OptionTag[] = [
        { key: "tags.partner_ovr", tone: "neutral", values: { value: offer.player.ovr } },
      ];
      if (offer.upgrade > 0) {
        tags.push({
          key: "tags.stronger_partner",
          tone: "good",
          values: { value: Math.round(offer.upgrade) },
        });
      }
      if (offer.requiresSideSwitch) {
        tags.push({ key: "tags.side_switch", tone: "bad", values: { value: 8 } });
      }
      tags.push({ key: "tags.chemistry_reset", tone: "bad" });

      options.push({
        id: optionId,
        labelKey: "events.partner_market.options.offer",
        tags,
        outcomes: [
          {
            weight: 100,
            resultKey: "events.partner_market.results.accepted",
            effects: { leavePartner: true },
          },
        ],
        partnerId: offer.player.id,
        partnerBand: offer.band,
        requiresSideSwitch: offer.requiresSideSwitch,
      });

      this.pendingOffers.set(optionId, {
        partnerId: offer.player.id,
        band: offer.band,
        sideSwitch: offer.requiresSideSwitch,
      });
    });

    if (!dumped && this.state.partnerId) {
      options.push({
        id: "stay",
        labelKey: "events.partner_market.options.stay",
        tags: [
          { key: "tags.keep_chemistry", tone: "good", values: { value: this.state.chemistry } },
          { key: "tags.no_change", tone: "neutral" },
        ],
        outcomes: [
          { weight: 100, resultKey: "events.partner_market.results.stayed", effects: {} },
        ],
      });
    }

    if (options.length > 0) {
      const card: DecisionCard = {
        id: `partner_market_${this.state.year}`,
        eventId: "partner_market",
        timing: "end_of_season",
        titleKey: dumped ? "events.partner_market.title_dumped" : "events.partner_market.title",
        descriptionKey: dumped
          ? "events.partner_market.description_dumped"
          : "events.partner_market.description",
        values: {
          partner: this.state.partnerId ? this.nameOf(this.state.partnerId) : "",
          titles: totals.titles,
        },
        options,
      };
      this.endOfSeasonQueue.push(card);
    }

    const extra = pickEndOfSeasonEvent(ctx, this.rng);
    if (extra) this.endOfSeasonQueue.push(extra);
  }

  /** Rolls the world and the career into the next season. */
  private rolloverSeason(): void {
    if (this.state.you.age >= END_AGE) {
      this.retire("age");
      return;
    }

    this.state.season += 1;
    this.state.year += 1;
    this.state.week = 1;
    this.seasonStarted = false;
    this.seasonClosed = false;

    if (this.state.banSeasonsLeft > 0) this.state.banSeasonsLeft -= 1;

    // Age the player, then the rest of the tour.
    ageOneSeason(this.state.you, { coachBonus: this.state.coachBonus, rng: this.rng });
    this.world.players.set(this.state.you.id, clonePlayer(this.state.you));

    const protectedIds = new Set<string>([this.state.you.id]);
    if (this.state.partnerId) protectedIds.add(this.state.partnerId);

    const report = advanceWorld({
      world: this.world,
      rng: this.rng,
      year: this.state.year,
      bank: this.nameBank,
      protectedIds,
    });

    // If the partner retired anyway, the market will have to replace them.
    if (this.state.partnerId && this.world.retiredIds.has(this.state.partnerId)) {
      this.recordPartnership();
      this.state.partnerId = null;
    }

    repair(this.world, this.rng, protectedIds);
    rescoreLadder(this.world, this.rng);

    this.state.sidePenalty = decaySidePenalty(this.state.sidePenalty);
    this.state.fatigue = Math.max(0, this.state.fatigue - 35);
    this.state.form = Math.round(this.state.form * 0.5);

    // A career without a partner cannot compete — pair with the best available.
    if (!this.state.partnerId) {
      const replacement = pickStartingPartner(this.world, this.state.you, this.rng);
      if (replacement) {
        this.state.partnerId = replacement.id;
        this.state.chemistry = STARTING_CHEMISTRY;
        this.log.push({
          kind: "partner_change",
          fromId: null,
          toId: replacement.id,
          year: this.state.year,
        });
      }
    }

    if (report.retiredIds.length > 0 || report.debutedIds.length > 0) {
      // Keep the player's own row on the ladder after the rescore.
      this.world.points.set(this.state.you.id, this.state.rankingPoints);
      sortLadder(this.world);
    }
  }

  private retire(reason: "age" | "ban" | "decline"): void {
    this.recordPartnership();
    this.state.retired = true;
    this.state.retiredReason = reason;
    this.log.push({ kind: "retired", reason, year: this.state.year });
  }

  /* ---------------- effects ---------------- */

  private applyEffects(effects: Effect, chosen: EventOption): void {
    const state = this.state;

    if (effects.ovr) nudgeOvr(state.you, effects.ovr);
    if (effects.attribute && effects.attributeDelta) {
      nudgeAttribute(state.you, effects.attribute as AttributeKey, effects.attributeDelta);
    }
    if (effects.potential) {
      state.you.potential = clampOvr(state.you.potential + effects.potential);
    }

    if (effects.form) state.form = Math.max(-50, Math.min(100, state.form + effects.form));
    if (effects.fatigue) state.fatigue = Math.max(0, Math.min(100, state.fatigue + effects.fatigue));
    if (effects.morale) state.morale = Math.max(0, Math.min(100, state.morale + effects.morale));
    if (effects.chemistry) {
      state.chemistry = Math.max(0, Math.min(100, state.chemistry + effects.chemistry));
    }
    if (effects.money) state.earnings = Math.max(0, state.earnings + effects.money);
    if (effects.rankingPoints) {
      state.rankingPoints = Math.max(0, state.rankingPoints + effects.rankingPoints);
    }

    if (effects.injuryWeeks) {
      state.injury = {
        key: "injury.knock",
        weeks: effects.injuryWeeks,
        severity: effects.injurySeverity ?? 3,
      };
    }

    if (effects.coachBonus) state.coachBonus = effects.coachBonus;
    if (effects.physioBonus) state.physioBonus = effects.physioBonus;

    if (effects.banSeasons) {
      state.banSeasonsLeft = effects.banSeasons;
      state.rankingPoints = 0;
      // A ban this late simply ends it.
      if (state.you.age + effects.banSeasons >= END_AGE) this.retire("ban");
    }

    if (effects.band) state.band = effects.band;

    if (effects.switchSide) this.switchSide();

    const takeId = effects.takePartnerId ?? chosen.partnerId;
    if (takeId && takeId !== state.partnerId) {
      this.recordPartnership();
      const from = state.partnerId;
      state.partnerId = takeId;
      state.chemistry = STARTING_CHEMISTRY;

      // Accepting an elite partner *is* the move up to their band (§5). It is
      // one-way: pairing with a lower-ranked player never demotes you, because
      // dropping a band is meant to be a deliberate call on the switch_band card.
      const band = chosen.partnerBand ?? this.pendingOffers.get(chosen.id)?.band;
      if (band && BAND_ORDER[band] > BAND_ORDER[state.band]) state.band = band;

      this.log.push({ kind: "partner_change", fromId: from, toId: takeId, year: state.year });
    } else if (effects.leavePartner && !takeId) {
      this.recordPartnership();
      state.partnerId = null;
    }
  }

  private switchSide(): void {
    const you = this.state.you;
    you.currentSide = you.currentSide === "drive" ? "reves" : "drive";
    you.ovr = computeOvr(you.attributes, you.currentSide);
    this.state.sidePenalty = beginSideSwitch(you);
  }

  /** Folds the current partnership into the career aggregate for the final card. */
  private recordPartnership(): void {
    const partnerId = this.state.partnerId;
    if (!partnerId) return;

    const results = this.state.results.filter((r) => r.partnerId === partnerId);
    if (results.length === 0) return;

    const titles = results.filter((r) => r.roundReached === WINNER_ROUND_INDEX).length;
    const finals = results.filter((r) => r.roundReached >= WINNER_ROUND_INDEX - 1).length;
    const years = results.map((r) => r.year);

    const existing = this.state.partnerships.find((p) => p.partnerId === partnerId);
    const record: PartnershipRecord = {
      partnerId,
      seasonsTogether: new Set(years).size,
      titles,
      finals,
      matchesWon: results.reduce((sum, r) => sum + r.matchesWon, 0),
      firstYear: Math.min(...years),
      lastYear: Math.max(...years),
    };

    if (existing) Object.assign(existing, record);
    else this.state.partnerships.push(record);
  }
}

/* ---------------- legacy ---------------- */

/** The headline tier on the final card (§14). */
export function legacyTier(state: CareerState): LegacyTier {
  const majors = state.awards.filter((a) => a.type === "major").length;
  const no1 = state.awards.filter((a) => a.type === "fip_no1").length;
  const bestRank = state.history.reduce(
    (best, row) => (row.rank > 0 && row.rank < best ? row.rank : best),
    Number.POSITIVE_INFINITY,
  );

  if (no1 >= 2 || majors >= 4) return "legend";
  if (no1 >= 1 || majors >= 1 || (bestRank <= 10 && state.bigTitles >= 8)) return "champion";
  if (bestRank <= 50 || state.bigTitles >= 3) return "contender";
  return "journeyman";
}

/** Best career ranking reached, or 0 if never ranked. */
export function peakRank(state: CareerState): number {
  let best = 0;
  for (const row of state.history) {
    if (row.rank > 0 && (best === 0 || row.rank < best)) best = row.rank;
  }
  return best;
}

/** Partnerships ordered by significance, for the final card's grid (§14). */
export function definingPartnerships(state: CareerState): PartnershipRecord[] {
  return [...state.partnerships].sort(
    (a, b) => b.titles - a.titles || b.seasonsTogether - a.seasonsTogether,
  );
}

/** Awards grouped for the trophy case. */
export function awardCounts(state: CareerState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const award of state.awards) {
    counts.set(award.type, (counts.get(award.type) ?? 0) + 1);
  }
  return counts;
}

export type { Award, CareerState, Tournament };
export { BAND_CATEGORIES, ROUND_LADDER, bandForRank };
