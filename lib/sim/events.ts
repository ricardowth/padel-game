/**
 * The decision catalog (§10) and the seeded trigger model (§3).
 *
 * Every event is **data**: ids, weights, context gates, mechanical effects, and
 * i18n *keys*. No user-facing sentence exists in this file — the UI resolves
 * `events.<id>.title` and friends against /messages/*.json, which is what lets
 * the whole decision system ship in EN + PT with zero engine changes.
 *
 * Key layout:
 *   events.<id>.title
 *   events.<id>.description
 *   events.<id>.options.<optionId>
 *   events.<id>.results.<resultKey>
 *   tags.<tag>
 */
import type { Band, Pace } from "../data/types";
import type { Rng } from "./rng";
import type {
  DecisionCard,
  EventContext,
  EventDefinition,
  EventOption,
  OptionTag,
} from "./types";

/**
 * Per-week trigger probability. A season runs ~40 competition weeks, so 0.028
 * yields about one in-season pop-up per season on Story and roughly one every
 * three seasons on Quick — matching §3's "~2 decisions/season" and
 * "~1 decision/season" once the always-on end-of-season card is counted.
 */
export const POPUP_CHANCE: Record<Pace, number> = {
  story: 0.028,
  quick: 0.008,
};

const tag = (key: string, tone: OptionTag["tone"], values?: OptionTag["values"]): OptionTag => ({
  key,
  tone,
  ...(values ? { values } : {}),
});

/** Small helper so catalog entries stay declarative. */
function card(
  id: string,
  timing: DecisionCard["timing"],
  options: EventOption[],
  values?: Record<string, string | number>,
): DecisionCard {
  return {
    id: `${id}`,
    eventId: id,
    timing,
    titleKey: `events.${id}.title`,
    descriptionKey: `events.${id}.description`,
    ...(values ? { values } : {}),
    options,
  };
}

const option = (
  eventId: string,
  id: string,
  tags: OptionTag[],
  outcomes: EventOption["outcomes"],
  extra: Partial<EventOption> = {},
): EventOption => ({
  id,
  labelKey: `events.${eventId}.options.${id}`,
  tags,
  outcomes,
  ...extra,
});

const result = (eventId: string, key: string) => `events.${eventId}.results.${key}`;

/** Below this, a season's previa record is noise rather than evidence. */
const MIN_QUALIFYING_ATTEMPTS = 4;

/**
 * Whether the player spent the season failing to play their way into main draws.
 *
 * This is the *only* thing that can cost a Premier place (§7). A Premier player
 * is not relegated by a ranking that quietly slips, by a season that went badly,
 * or by a year spent down on money — they hold their level until the qualifying
 * draw itself says they no longer belong there. Everywhere below Premier the
 * economics still count, because down there the travel bill really is the thing
 * that ends careers.
 */
function failingQualifying(ctx: EventContext): boolean {
  const attempts = ctx.career.qualifyingAttempts;
  if (attempts < MIN_QUALIFYING_ATTEMPTS) return false;
  return ctx.career.qualifyingFailures / attempts >= 0.5;
}

/* ------------------------------------------------------------------ */
/* In-season pop-ups (§10)                                             */
/* ------------------------------------------------------------------ */

const TRAIN_HARDER: EventDefinition = {
  id: "train_harder",
  timing: "in_season",
  weight: 10,
  weightFor: (ctx) => (ctx.career.fatigue < 55 ? 1.4 : 0.5),
  build: (ctx) =>
    card("train_harder", "in_season", [
      option(
        "train_harder",
        "push",
        [tag("tags.ovr_up", "good", { value: 2 }), tag("tags.fatigue_up", "bad")],
        [
          { weight: 55, resultKey: result("train_harder", "gain"), effects: { ovr: 2, fatigue: 14 } },
          { weight: 30, resultKey: result("train_harder", "small"), effects: { ovr: 1, fatigue: 12 } },
          {
            weight: 15,
            resultKey: result("train_harder", "tweak"),
            effects: { injuryWeeks: 3, injurySeverity: 4, fatigue: 8 },
          },
        ],
      ),
      option(
        "train_harder",
        "balanced",
        [tag("tags.no_change", "neutral")],
        [
          { weight: 70, resultKey: result("train_harder", "steady"), effects: { ovr: 1, fatigue: 4 } },
          { weight: 30, resultKey: result("train_harder", "flat"), effects: {} },
        ],
      ),
      option(
        "train_harder",
        "rest",
        [tag("tags.fatigue_down", "good"), tag("tags.no_growth", "bad")],
        [{ weight: 100, resultKey: result("train_harder", "rested"), effects: { fatigue: -22, form: 6 } }],
      ),
    ]),
};

const INJURY_KNOCK: EventDefinition = {
  id: "injury_knock",
  timing: "in_season",
  weight: 8,
  eligible: (ctx) => !ctx.career.injured,
  weightFor: (ctx) => (ctx.career.fatigue > 60 ? 2.4 : 0.6),
  build: () =>
    card("injury_knock", "in_season", [
      option(
        "injury_knock",
        "rest",
        [tag("tags.miss_events", "bad", { value: 3 }), tag("tags.recover_fully", "good")],
        [
          {
            weight: 100,
            resultKey: result("injury_knock", "rested"),
            effects: { injuryWeeks: 3, injurySeverity: 2, fatigue: -25 },
          },
        ],
      ),
      option(
        "injury_knock",
        "play_through",
        [tag("tags.keep_points", "good"), tag("tags.injury_risk", "bad")],
        [
          { weight: 45, resultKey: result("injury_knock", "held_up"), effects: { fatigue: 10, morale: 5 } },
          {
            weight: 55,
            resultKey: result("injury_knock", "worsened"),
            effects: { injuryWeeks: 7, injurySeverity: 6, form: -20, morale: -10 },
          },
        ],
      ),
    ]),
};

const PARTNER_TENSION: EventDefinition = {
  id: "partner_tension",
  timing: "in_season",
  weight: 8,
  eligible: (ctx) => ctx.career.partnerId !== null,
  weightFor: (ctx) => (ctx.career.chemistry < 45 ? 2.6 : 0.5),
  build: (ctx) =>
    card(
      "partner_tension",
      "in_season",
      [
        option(
          "partner_tension",
          "smooth",
          [tag("tags.chemistry_up", "good"), tag("tags.focus_cost", "bad")],
          [
            {
              weight: 70,
              resultKey: result("partner_tension", "resolved"),
              effects: { chemistry: 14, form: -4 },
            },
            { weight: 30, resultKey: result("partner_tension", "awkward"), effects: { chemistry: 5 } },
          ],
        ),
        option(
          "partner_tension",
          "simmer",
          [tag("tags.no_change", "neutral"), tag("tags.breakup_risk", "bad")],
          [
            { weight: 45, resultKey: result("partner_tension", "ignored"), effects: {} },
            {
              weight: 55,
              resultKey: result("partner_tension", "festered"),
              effects: { chemistry: -20, morale: -6 },
            },
          ],
        ),
      ],
      { partner: ctx.career.partnerId ? ctx.nameOf(ctx.career.partnerId) : "" },
    ),
};

const WILDCARD_OFFER: EventDefinition = {
  id: "wildcard_offer",
  timing: "in_season",
  weight: 7,
  eligible: (ctx) => ctx.career.band !== "elite",
  weightFor: (ctx) => (ctx.career.form > 40 ? 2.2 : 0.7),
  build: () =>
    card("wildcard_offer", "in_season", [
      option(
        "wildcard_offer",
        "accept",
        [tag("tags.points_up", "good"), tag("tags.travel_fatigue", "bad")],
        [
          {
            weight: 35,
            resultKey: result("wildcard_offer", "deep_run"),
            effects: { rankingPoints: 180, money: 6000, fatigue: 16, morale: 12 },
          },
          {
            weight: 65,
            resultKey: result("wildcard_offer", "early_exit"),
            effects: { rankingPoints: 25, money: 1200, fatigue: 14, morale: -4 },
          },
        ],
      ),
      option(
        "wildcard_offer",
        "decline",
        [tag("tags.no_change", "neutral")],
        [{ weight: 100, resultKey: result("wildcard_offer", "declined"), effects: { fatigue: -4 } }],
      ),
    ]),
};

const TECHNIQUE_TWEAK: EventDefinition = {
  id: "technique_tweak",
  timing: "in_season",
  weight: 7,
  build: () =>
    card("technique_tweak", "in_season", [
      option(
        "technique_tweak",
        "bandeja",
        [tag("tags.attribute_up", "good", { attribute: "bandeja" }), tag("tags.may_not_stick", "bad")],
        [
          {
            weight: 55,
            resultKey: result("technique_tweak", "stuck"),
            effects: { attribute: "bandeja", attributeDelta: 4 },
          },
          { weight: 45, resultKey: result("technique_tweak", "failed"), effects: { form: -5 } },
        ],
      ),
      option(
        "technique_tweak",
        "remate",
        [tag("tags.attribute_up", "good", { attribute: "remate" }), tag("tags.may_not_stick", "bad")],
        [
          {
            weight: 55,
            resultKey: result("technique_tweak", "stuck"),
            effects: { attribute: "remate", attributeDelta: 4 },
          },
          { weight: 45, resultKey: result("technique_tweak", "failed"), effects: { form: -5 } },
        ],
      ),
      option(
        "technique_tweak",
        "keep",
        [tag("tags.no_change", "neutral")],
        [{ weight: 100, resultKey: result("technique_tweak", "kept"), effects: { form: 3 } }],
      ),
    ]),
};

const PRIORITIZE: EventDefinition = {
  id: "prioritize",
  timing: "in_season",
  weight: 6,
  build: () =>
    card("prioritize", "in_season", [
      option(
        "prioritize",
        "target",
        [tag("tags.form_up", "good"), tag("tags.fatigue_up", "bad")],
        [
          { weight: 60, resultKey: result("prioritize", "peaked"), effects: { form: 22, fatigue: 8 } },
          { weight: 40, resultKey: result("prioritize", "flat"), effects: { form: -6, fatigue: 8 } },
        ],
      ),
      option(
        "prioritize",
        "spread",
        [tag("tags.fatigue_down", "good"), tag("tags.points_down", "bad")],
        [{ weight: 100, resultKey: result("prioritize", "spread"), effects: { fatigue: -14, form: 4 } }],
      ),
    ]),
};

const FINISH_SCHOOL: EventDefinition = {
  id: "finish_school",
  timing: "in_season",
  weight: 9,
  once: true,
  eligible: (ctx) => ctx.career.age >= 17 && ctx.career.age <= 19,
  build: () =>
    card("finish_school", "in_season", [
      // The reference's mixed-tag card: a green upside and a red downside together.
      option(
        "finish_school",
        "accept",
        [tag("tags.ovr_up_maturity", "good", { value: 1 }), tag("tags.lesser_role", "bad")],
        [
          {
            weight: 100,
            resultKey: result("finish_school", "graduated"),
            effects: { ovr: 1, morale: 10, form: -10, fatigue: 6 },
          },
        ],
      ),
      option(
        "finish_school",
        "full_time",
        [tag("tags.form_up", "good"), tag("tags.morale_down", "bad")],
        [{ weight: 100, resultKey: result("finish_school", "committed"), effects: { form: 12, morale: -6 } }],
      ),
    ]),
};

const MEDIA_MOMENT: EventDefinition = {
  id: "media_moment",
  timing: "in_season",
  weight: 5,
  eligible: (ctx) => ctx.career.rank > 0 && ctx.career.rank <= 60,
  build: () =>
    card("media_moment", "in_season", [
      option(
        "media_moment",
        "outspoken",
        [tag("tags.morale_up", "good"), tag("tags.pressure", "bad")],
        [
          { weight: 50, resultKey: result("media_moment", "loved"), effects: { morale: 14, money: 4000 } },
          { weight: 50, resultKey: result("media_moment", "backlash"), effects: { morale: -12, form: -8 } },
        ],
      ),
      option(
        "media_moment",
        "diplomatic",
        [tag("tags.no_change", "neutral")],
        [{ weight: 100, resultKey: result("media_moment", "measured"), effects: { morale: 3 } }],
      ),
    ]),
};

/**
 * §10's doping node — deliberately abstract. No substance, method or protocol is
 * named anywhere in the engine or the message catalog; the option is a bet on
 * consequences (a shot at a temporary edge against a ban that can end a career).
 */
const SHADY_EDGE: EventDefinition = {
  id: "shady_edge",
  timing: "in_season",
  weight: 1.2,
  once: true,
  eligible: (ctx) => ctx.career.age >= 21 && ctx.career.season >= 3,
  weightFor: (ctx) => (ctx.career.rank > 60 && ctx.career.morale < 45 ? 2.2 : 0.6),
  build: () =>
    card("shady_edge", "in_season", [
      option(
        "shady_edge",
        "accept",
        [tag("tags.ovr_up", "good", { value: 4 }), tag("tags.ban_risk", "bad")],
        [
          {
            weight: 62,
            resultKey: result("shady_edge", "undetected"),
            effects: { ovr: 4, form: 18, morale: -8 },
          },
          {
            weight: 38,
            resultKey: result("shady_edge", "caught"),
            effects: { banSeasons: 2, morale: -40, rankingPoints: -100000, money: -30000 },
          },
        ],
      ),
      option(
        "shady_edge",
        "decline",
        [tag("tags.no_change", "neutral")],
        [{ weight: 100, resultKey: result("shady_edge", "declined"), effects: { morale: 4 } }],
      ),
    ]),
};

/* ------------------------------------------------------------------ */
/* End-of-season events (§10). The partner market is built separately  */
/* in career.ts because its options are real players.                  */
/* ------------------------------------------------------------------ */

const SPONSOR_DEAL: EventDefinition = {
  id: "sponsor_deal",
  timing: "end_of_season",
  weight: 8,
  eligible: (ctx) => ctx.career.rank > 0 && ctx.career.rank <= 100 && !ctx.career.hasSponsor,
  build: () =>
    card("sponsor_deal", "end_of_season", [
      option(
        "sponsor_deal",
        "sign_big",
        [tag("tags.money_up", "good"), tag("tags.expectations", "bad")],
        [
          {
            weight: 100,
            resultKey: result("sponsor_deal", "signed"),
            effects: { money: 60000, morale: 8, form: -4 },
          },
        ],
      ),
      option(
        "sponsor_deal",
        "sign_small",
        [tag("tags.money_up", "good"), tag("tags.no_change", "neutral")],
        [{ weight: 100, resultKey: result("sponsor_deal", "signed_small"), effects: { money: 18000, morale: 4 } }],
      ),
      option(
        "sponsor_deal",
        "decline",
        [tag("tags.no_change", "neutral")],
        [{ weight: 100, resultKey: result("sponsor_deal", "declined"), effects: { morale: 2 } }],
      ),
    ]),
};

const HIRE_COACH: EventDefinition = {
  id: "hire_coach",
  timing: "end_of_season",
  weight: 8,
  eligible: (ctx) => !ctx.career.hasCoach && ctx.career.earnings > 40000,
  build: () =>
    card("hire_coach", "end_of_season", [
      option(
        "hire_coach",
        "coach",
        [tag("tags.growth_up", "good"), tag("tags.money_down", "bad")],
        [
          {
            weight: 100,
            resultKey: result("hire_coach", "hired_coach"),
            effects: { coachBonus: 1.35, money: -30000 },
          },
        ],
      ),
      option(
        "hire_coach",
        "physio",
        [tag("tags.injury_resistance", "good"), tag("tags.money_down", "bad")],
        [
          {
            weight: 100,
            resultKey: result("hire_coach", "hired_physio"),
            effects: { physioBonus: 0.6, money: -22000 },
          },
        ],
      ),
      option(
        "hire_coach",
        "neither",
        [tag("tags.no_change", "neutral")],
        [{ weight: 100, resultKey: result("hire_coach", "declined"), effects: {} }],
      ),
    ]),
};

const REST_YEAR: EventDefinition = {
  id: "rest_year",
  timing: "end_of_season",
  weight: 7,
  eligible: (ctx) => ctx.career.age >= 30,
  weightFor: (ctx) => (ctx.career.fatigue > 55 ? 2 : 0.8),
  build: () =>
    card("rest_year", "end_of_season", [
      option(
        "rest_year",
        "manage_load",
        [tag("tags.delay_decline", "good"), tag("tags.points_down", "bad")],
        [
          {
            weight: 100,
            resultKey: result("rest_year", "managed"),
            effects: { fatigue: -40, ovr: 1, rankingPoints: -300 },
          },
        ],
      ),
      option(
        "rest_year",
        "full_season",
        [tag("tags.points_up", "good"), tag("tags.decline_risk", "bad")],
        [
          { weight: 55, resultKey: result("rest_year", "held_level"), effects: { form: 8 } },
          { weight: 45, resultKey: result("rest_year", "burned_out"), effects: { ovr: -2, fatigue: 20 } },
        ],
      ),
    ]),
};

const SWITCH_BAND: EventDefinition = {
  id: "switch_band",
  timing: "end_of_season",
  weight: 9,
  // Only worth asking when the player is plausibly at a boundary.
  eligible: (ctx) => ctx.career.season >= 2,
  build: (ctx) => {
    const options: EventOption[] = [];

    if (ctx.career.band !== "elite" && ctx.career.rank > 0 && ctx.career.rank <= 60) {
      options.push(
        option(
          "switch_band",
          "move_up",
          [tag("tags.band_up", "good"), tag("tags.early_exits", "bad")],
          [{ weight: 100, resultKey: result("switch_band", "moved_up"), effects: { band: "elite", morale: 6 } }],
        ),
      );
    }

    if (ctx.career.band === "developmental" && ctx.career.rank > 0 && ctx.career.rank <= 140) {
      options.push(
        option(
          "switch_band",
          "move_pro",
          [tag("tags.band_up", "good"), tag("tags.tougher_fields", "bad")],
          [
            {
              weight: 100,
              resultKey: result("switch_band", "moved_pro"),
              effects: { band: "professional", morale: 4 },
            },
          ],
        ),
      );
    }

    // Leaving Premier is not a lifestyle choice you can make at will — the
    // qualifying draw has to have told you first (§7).
    if (ctx.career.band === "elite" && failingQualifying(ctx)) {
      options.push(
        option(
          "switch_band",
          "drop_pro",
          [tag("tags.easier_wins", "good"), tag("tags.prestige_down", "bad")],
          [
            {
              weight: 100,
              resultKey: result("switch_band", "dropped"),
              effects: { band: "professional", morale: -6 },
            },
          ],
        ),
      );
    }

    options.push(
      option(
        "switch_band",
        "stay",
        [tag("tags.no_change", "neutral")],
        [{ weight: 100, resultKey: result("switch_band", "stayed"), effects: {} }],
      ),
    );

    return card("switch_band", "end_of_season", options);
  },
};

/**
 * The bail-out card. Only offered when the player is *demonstrably* drowning at
 * their current level: mostly failing to get out of qualifying, or finishing the
 * season down on money once travel is paid for. Outside those conditions it
 * never appears, so it reads as a lifeline rather than a nag.
 *
 * Weighted high because when it does qualify, it is the most important decision
 * on the table.
 */
const DROP_DOWN: EventDefinition = {
  id: "drop_down",
  timing: "end_of_season",
  weight: 30,
  eligible: (ctx) => {
    if (ctx.career.band === "developmental") return false;

    // A Premier place is held until the previa takes it back, so a losing year
    // on the balance sheet is not on its own a reason to be shown the door.
    if (ctx.career.band === "elite") return failingQualifying(ctx);

    return failingQualifying(ctx) || ctx.career.seasonNet < 0;
  },
  build: (ctx) => {
    const target: Band = ctx.career.band === "elite" ? "professional" : "developmental";

    // Two ways to qualify for this card, and they need different words: one is
    // "you keep losing in the previa", the other is "you made the draws and
    // still finished the year down". Using the qualifying copy for a player
    // with zero qualifying attempts reads as a bug, because it is one.
    const drowning = ctx.career.qualifyingAttempts > 0 && ctx.career.qualifyingFailures > 0;

    const built = card(
      "drop_down",
      "end_of_season",
      [
        option(
          "drop_down",
          "drop",
          [
            tag("tags.main_draw_entry", "good"),
            tag("tags.stop_bleeding", "good"),
            tag("tags.prestige_down", "bad"),
          ],
          [
            {
              weight: 100,
              resultKey: result("drop_down", "dropped"),
              effects: { band: target, morale: -8, form: 10 },
            },
          ],
        ),
        option(
          "drop_down",
          "stick",
          [tag("tags.keep_prestige", "good"), tag("tags.money_down", "bad")],
          [
            {
              weight: 55,
              resultKey: result("drop_down", "stuck_it_out"),
              effects: { morale: 6 },
            },
            {
              weight: 45,
              resultKey: result("drop_down", "sank"),
              effects: { morale: -14, form: -10 },
            },
          ],
        ),
      ],
      {
        failures: ctx.career.qualifyingFailures,
        attempts: ctx.career.qualifyingAttempts,
      },
    );

    return {
      ...built,
      descriptionKey: drowning
        ? "events.drop_down.description"
        : "events.drop_down.description_money",
    };
  },
};

export const IN_SEASON_EVENTS: EventDefinition[] = [
  TRAIN_HARDER,
  INJURY_KNOCK,
  PARTNER_TENSION,
  WILDCARD_OFFER,
  TECHNIQUE_TWEAK,
  PRIORITIZE,
  FINISH_SCHOOL,
  MEDIA_MOMENT,
  SHADY_EDGE,
];

export const END_OF_SEASON_EVENTS: EventDefinition[] = [
  DROP_DOWN,
  SPONSOR_DEAL,
  HIRE_COACH,
  REST_YEAR,
  SWITCH_BAND,
];

export const ALL_EVENTS: EventDefinition[] = [...IN_SEASON_EVENTS, ...END_OF_SEASON_EVENTS];

/** Events currently allowed to fire, with their context-adjusted weights. */
function eligibleWith(
  definitions: EventDefinition[],
  ctx: EventContext,
): { definition: EventDefinition; weight: number }[] {
  const out: { definition: EventDefinition; weight: number }[] = [];

  for (const definition of definitions) {
    if (definition.once && ctx.career.firedEventIds.includes(definition.id)) continue;
    if (definition.eligible && !definition.eligible(ctx)) continue;

    const weight = definition.weight * (definition.weightFor?.(ctx) ?? 1);
    if (weight > 0) out.push({ definition, weight });
  }

  return out;
}

/**
 * Rolls one in-season week. Returns a card when an event fires, else null.
 * Context weighting means a tired player draws injuries and a cold pairing
 * draws tension — no two seasons trigger the same set (§3).
 */
export function rollInSeasonEvent(
  ctx: EventContext,
  rng: Rng,
  pace: Pace,
): DecisionCard | null {
  if (!rng.chance(POPUP_CHANCE[pace])) return null;

  const pool = eligibleWith(IN_SEASON_EVENTS, ctx);
  if (pool.length === 0) return null;

  const definition = rng.weighted(
    pool.map((p) => p.definition),
    pool.map((p) => p.weight),
  );
  return definition.build(ctx);
}

/** Picks the optional end-of-season card that accompanies the partner market. */
export function pickEndOfSeasonEvent(ctx: EventContext, rng: Rng): DecisionCard | null {
  const pool = eligibleWith(END_OF_SEASON_EVENTS, ctx);
  if (pool.length === 0) return null;

  const definition = rng.weighted(
    pool.map((p) => p.definition),
    pool.map((p) => p.weight),
  );
  const built = definition.build(ctx);

  // A card whose only option is "do nothing" is not a decision.
  return built.options.length > 1 ? built : null;
}

/** Resolves one chosen option into a concrete outcome. */
export function resolveOption(chosen: EventOption, rng: Rng) {
  const outcome = rng.weighted(
    chosen.outcomes,
    chosen.outcomes.map((o) => o.weight),
  );
  return outcome;
}
