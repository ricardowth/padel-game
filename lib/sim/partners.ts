/**
 * The partner system (§5) — the heart of the game.
 *
 * Team strength blends both players' OVR with chemistry and side balance, so a
 * long-tenured pairing can genuinely out-perform a higher-rated new one for a
 * season or two (§16). Offers that surface at the end of a season depend on
 * results, ranking and OVR, which is what makes a breakout season feel like it
 * paid off.
 */
import type { Band, CareerState, Player, Side, SidePenalty } from "../data/types";
import { computeOvr } from "./ovr";
import { effectiveOvr } from "./pool";
import type { Rng } from "./rng";
import type { Pair, StrengthBreakdown, World } from "./types";

/** Chemistry starts here for a brand-new pairing. */
export const STARTING_CHEMISTRY = 40;
export const MAX_CHEMISTRY = 100;

/** §6: the immediate cost of switching sides, and the floor it decays to. */
export const SIDE_SWITCH_PENALTY = 8;
export const SIDE_SWITCH_FLOOR = 2;
export const SIDE_SWITCH_DECAY_SEASONS = 3;

/** Playing off your natural side is harder for some styles than others. */
const PENALTY_BY_PLAYSTYLE: Record<Player["playstyle"], number> = {
  power: 10, // a finisher's whole game is built around one wall
  playmaker: 8,
  counter: 7,
  allcourt: 6, // adaptable by definition
};

export function beginSideSwitch(player: Player): SidePenalty {
  return {
    current: PENALTY_BY_PLAYSTYLE[player.playstyle] ?? SIDE_SWITCH_PENALTY,
    floor: SIDE_SWITCH_FLOOR,
    seasonsLeft: SIDE_SWITCH_DECAY_SEASONS,
  };
}

/** Decays the switch penalty one season toward — but never below — its floor. */
export function decaySidePenalty(penalty: SidePenalty | null): SidePenalty | null {
  if (!penalty) return null;
  if (penalty.seasonsLeft <= 0) return penalty;

  const step = (penalty.current - penalty.floor) / penalty.seasonsLeft;
  return {
    current: Math.max(penalty.floor, penalty.current - step),
    floor: penalty.floor,
    seasonsLeft: penalty.seasonsLeft - 1,
  };
}

/** The player's OVR as it actually plays, after the side-switch penalty. */
export function careerEffectiveOvr(career: CareerState): number {
  const base = computeOvr(career.you.attributes, career.you.currentSide);
  const penalty = career.sidePenalty?.current ?? 0;
  const injury = career.injury ? career.injury.severity : 0;
  return Math.max(16, Math.round(base - penalty - injury));
}

export interface TeamContext {
  /** The player's effective OVR, penalties already applied. */
  ownOvr: number;
  ownSide: Side;
  partner: Player | null;
  chemistry: number;
  form: number;
  fatigue: number;
}

/**
 * TeamStrength = f(yourOVR, partnerOVR, chemistry, sideBalance).
 *
 * Chemistry is worth up to +/-3 and side balance +2/-4 — enough that loyalty can
 * beat a couple of points of raw partner OVR, which is the tension §16 wants.
 */
export function teamStrength(ctx: TeamContext): StrengthBreakdown {
  const partnerOvr = ctx.partner ? effectiveOvr(ctx.partner) : ctx.ownOvr - 8;
  const base = (ctx.ownOvr + partnerOvr) / 2;

  const chemistry = ((ctx.chemistry - 50) / 50) * 3;

  // One of you has to cover the other wall if you both want the same one.
  const sideBalance = ctx.partner && ctx.partner.naturalSide === ctx.ownSide ? -4 : 2;

  const form = (ctx.form / 100) * 3;
  const fatigue = -(ctx.fatigue / 100) * 5;

  return {
    base,
    chemistry,
    sideBalance,
    form,
    fatigue,
    injury: 0,
    total: base + chemistry + sideBalance + form + fatigue,
  };
}

export function careerTeamStrength(career: CareerState, world: World): StrengthBreakdown {
  return teamStrength({
    ownOvr: careerEffectiveOvr(career),
    ownSide: career.you.currentSide,
    partner: career.partnerId ? (world.players.get(career.partnerId) ?? null) : null,
    chemistry: career.chemistry,
    form: career.form,
    fatigue: career.fatigue,
  });
}

/**
 * Chemistry grows with time together and with winning; a bad season erodes it.
 * Deliberately asymmetric — building takes seasons, losing it takes one.
 */
export function updateChemistry(
  current: number,
  seasonTitles: number,
  seasonFinals: number,
  matchWinRate: number,
): number {
  let next = current + 8; // a season together is worth something on its own
  next += seasonTitles * 3;
  next += seasonFinals * 1.5;

  if (matchWinRate < 0.4) next -= 14;
  else if (matchWinRate < 0.5) next -= 6;

  return Math.max(0, Math.min(MAX_CHEMISTRY, Math.round(next)));
}

/** Band a player's ranking makes them belong to — the tier label on an offer card. */
export function bandForRank(rank: number): Band {
  if (rank <= 40) return "elite";
  if (rank <= 110) return "professional";
  return "developmental";
}

/** Minimum ranking required to enter a band's main draws (§7 access rules). */
export const BAND_RANK_GATE: Record<Band, number> = {
  developmental: Number.POSITIVE_INFINITY,
  professional: 140,
  elite: 60,
};

export function canEnterBand(band: Band, rank: number, hasWildcard = false): boolean {
  if (hasWildcard) return true;
  return rank <= BAND_RANK_GATE[band];
}

export interface PartnerOffer {
  player: Player;
  band: Band;
  /** Their rank at the time of the offer. */
  rank: number;
  /** True when they own the side the career player currently occupies. */
  requiresSideSwitch: boolean;
  /** Rough quality of the offer relative to the current partner, in OVR points. */
  upgrade: number;
}

export interface OfferOptions {
  career: CareerState;
  world: World;
  rng: Rng;
  /** Rank the player finished the season on. */
  rank: number;
  /** How the season went, -1 (disaster) .. +1 (breakout). */
  seasonQuality: number;
  count?: number;
}

/**
 * Builds the end-of-season partner market (§5).
 *
 * A breakout season reaches further up the ladder; a poor one surfaces lateral
 * or downward moves. Candidates are drawn from a window around the level the
 * player has *earned*, never from the whole pool, so offers always read as a
 * plausible response to the season just played.
 */
export function buildOffers({
  career,
  world,
  rng,
  rank,
  seasonQuality,
  count = 3,
}: OfferOptions): PartnerOffer[] {
  const ownOvr = careerEffectiveOvr(career);

  // A great season lets you reach ~6 OVR above yourself; a bad one drops the ceiling.
  const reach = 3 + seasonQuality * 5;
  const ceiling = ownOvr + reach;
  const floor = ownOvr - 12;

  const candidates: PartnerOffer[] = [];
  for (let i = 0; i < world.activeIds.length; i++) {
    const id = world.activeIds[i]!;
    if (id === career.partnerId || id === career.you.id) continue;

    const player = world.players.get(id);
    if (!player) continue;

    const ovr = effectiveOvr(player);
    if (ovr > ceiling || ovr < floor) continue;

    // Established players do not drop to a much lower-ranked partner for nothing.
    const theirRank = i + 1;
    if (theirRank < rank / 3 && seasonQuality < 0.5) continue;

    candidates.push({
      player,
      band: bandForRank(theirRank),
      rank: theirRank,
      requiresSideSwitch: player.naturalSide === career.you.currentSide,
      upgrade: ovr - ownOvr,
    });
  }

  // A 16-year-old starts at OVR ~44, well below a top-200 pool that floors
  // around 62, so the window above finds nobody and the market would show a
  // lone "stay" option for the first several seasons — not a decision at all.
  // Fall back to the bottom of the ladder: the grinders a teenager would
  // realistically partner with.
  if (candidates.length === 0) {
    const tail = world.activeIds.slice(-24);
    for (let i = 0; i < tail.length; i++) {
      const id = tail[i]!;
      if (id === career.partnerId || id === career.you.id) continue;

      const player = world.players.get(id);
      if (!player) continue;

      const theirRank = world.activeIds.length - tail.length + i + 1;
      candidates.push({
        player,
        band: bandForRank(theirRank),
        rank: theirRank,
        requiresSideSwitch: player.naturalSide === career.you.currentSide,
        upgrade: effectiveOvr(player) - ownOvr,
      });
    }
  }

  if (candidates.length === 0) return [];

  // Prefer the best available, but keep it seeded and varied rather than optimal.
  const shuffled = rng.shuffle(candidates);
  shuffled.sort((a, b) => b.upgrade - a.upgrade);

  const picked: PartnerOffer[] = [];
  const spread = Math.max(1, Math.floor(shuffled.length / count));
  for (let i = 0; i < count && i * spread < shuffled.length; i++) {
    const slice = shuffled.slice(i * spread, (i + 1) * spread);
    if (slice.length > 0) picked.push(rng.pick(slice));
  }

  return picked;
}

/**
 * Whether the current partner walks away. Underperform and a better-ranked
 * player will take the call — the "Lebron/Galan breakup" beat (§5).
 */
export function partnerLeaves(
  career: CareerState,
  partnerRank: number,
  playerRank: number,
  rng: Rng,
): boolean {
  if (!career.partnerId) return false;

  // They out-rank you by a distance and you had a poor year.
  const gap = playerRank - partnerRank;
  let chance = 0;
  if (gap > 40) chance += 0.25;
  if (gap > 100) chance += 0.25;
  if (career.chemistry < 35) chance += 0.2;
  if (career.chemistry > 75) chance -= 0.2;

  return rng.chance(Math.max(0, Math.min(0.7, chance)));
}

/** Puts the career player and a partner on their sides, honouring the switch. */
export function pairFor(career: CareerState, partner: Player | null): Pair | null {
  if (!partner) return null;
  return career.you.currentSide === "drive"
    ? { driveId: career.you.id, revesId: partner.id, chemistry: career.chemistry }
    : { driveId: partner.id, revesId: career.you.id, chemistry: career.chemistry };
}
