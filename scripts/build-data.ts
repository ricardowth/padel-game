/**
 * Phase 0 — derive the four player pools from the raw FIP snapshots (§11).
 *
 *   data/raw/ranking.<tour>.json   +  data/raw/profiles.<tour>.json
 *     -> data/players.<tour>.json      (~200 real seniors)
 *   data/raw/promises.<tour>.json  +  data/raw/profiles.<tour>.json
 *     -> data/promises.<tour>.json     (~50 NextGen, staggered debut years)
 *
 * Everything is rank-derived and deterministic: the same raw snapshot always
 * produces byte-identical output, and the JSON stays hand-editable afterwards.
 *
 *   npm run data:build
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { toIsoAlpha2 } from "../lib/data/countries";
import {
  ATTRIBUTE_KEYS,
  type Attributes,
  type Player,
  type PlayerPoolFile,
  type Playstyle,
  type Side,
  type Tour,
} from "../lib/data/types";
import { createRng, type Rng } from "../lib/sim/rng";
import { PLAYSTYLE_BIAS, SIDE_BIAS, clampOvr, computeOvr, normaliseToOvr } from "../lib/sim/ovr";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = resolve(ROOT, "data/raw");
const OUT = resolve(ROOT, "data");

/** In-game year 1 uses the real 2026 season (§8). */
const SNAPSHOT_YEAR = 2026;
/** Ages are measured at mid-season so a career year lines up with a calendar year. */
const AGE_REFERENCE = new Date(`${SNAPSHOT_YEAR}-07-01T00:00:00Z`);

const SENIOR_POOL_SIZE = 200;
/**
 * NextGen intake. FIP's under-16/under-18 ladders carry 300+ unique juniors per
 * tour, and a 19-season career burns through names fast — a bigger promise pool
 * means the late-career tour is still full of real people rather than regens.
 */
const PROMISE_POOL_SIZE = 140;

/**
 * Tokens that begin a compound surname. When one appears, everything before it
 * is a given name and it starts the surname: "Juan Ignacio De Pascual".
 */
const SURNAME_PARTICLES = new Set([
  "de", "del", "da", "das", "do", "dos", "di", "dal", "della", "van", "von",
  "der", "den", "la", "le", "el", "san", "santa", "mac", "mc", "bin", "al",
]);

/**
 * Common given names that show up as a *second* forename. Spanish and Portuguese
 * players routinely carry two, and without this list "Carlos Daniel Gutierrez"
 * shortens to "Carlos Daniel" — a first name twice over, and no surname.
 */
const SECOND_FORENAMES = new Set([
  "daniel", "gabriel", "jose", "josé", "maria", "maría", "juan", "luis", "carlos",
  "manuel", "antonio", "francisco", "miguel", "agustin", "agustín", "enrique",
  "rodrigo", "renato", "alejandro", "ignacio", "javier", "andres", "andrés",
  "eduardo", "fernando", "alberto", "ricardo", "pablo", "pedro", "sergio",
  "diego", "martin", "martín", "angel", "ángel", "ramon", "ramón", "jesus",
  "jesús", "vicente", "emilio", "felipe", "gonzalo", "guillermo", "ivan", "iván",
  "joaquin", "joaquín", "julian", "julián", "lucas", "mateo", "nicolas",
  "nicolás", "oscar", "óscar", "raul", "raúl", "roberto", "salvador", "tomas",
  "tomás", "victor", "víctor", "adrian", "adrián", "alonso", "esteban", "isabel",
  "ana", "carmen", "pilar", "rosa", "teresa", "lucia", "lucía", "sofia", "sofía",
  "paula", "laura", "marta", "elena", "cristina", "beatriz", "patricia",
]);

const isParticle = (token: string) => SURNAME_PARTICLES.has(token.toLowerCase());

/** "G." or "G" — a middle initial, never the name anyone uses. */
const isInitial = (token: string) => /^[A-Za-zÀ-ÿ]\.?$/.test(token);

/**
 * Shortens a full legal name to the one people actually use.
 *
 * FIP publishes names in full — "Mariano Agustin Gonzalez San Martin" — which is
 * unreadable in a ledger cell and nothing like how the sport talks about its
 * players. This keeps the first forename and the paternal surname:
 *
 *   Maximiliano Arce Simo        -> Maximiliano Arce
 *   Carlos Daniel Gutierrez      -> Carlos Gutierrez
 *   Juan Ignacio De Pascual      -> Juan De Pascual
 *   Franco Renato Dal Bianco     -> Franco Dal Bianco
 *   Arturo Coello                -> Arturo Coello   (already short)
 */
export function friendlyName(full: string): string {
  const tokens = full.split(/\s+/).filter(Boolean);
  if (tokens.length <= 2) return tokens.join(" ");

  // A particle appearing early starts the surname outright, whatever sits in
  // front of it: "Olivier Guy De Chamisso" is a De Chamisso. Later than that and
  // it is usually the *maternal* surname ("... Gonzalez San Martin"), which is
  // exactly the half we want to drop.
  let i = [1, 2].find((k) => k < tokens.length - 1 && isParticle(tokens[k]!)) ?? -1;

  if (i === -1) {
    // No particle: walk past additional forenames and middle initials.
    i = 1;
    while (
      i < tokens.length - 1 &&
      (isInitial(tokens[i]!) || SECOND_FORENAMES.has(tokens[i]!.toLowerCase()))
    ) {
      i++;
    }
  }

  // A particle takes the token after it with it ("De Pascual", "Dal Bianco").
  const surname = isParticle(tokens[i]!)
    ? tokens.slice(i, i + 2).join(" ")
    : tokens[i]!;

  return `${tokens[0]} ${surname}`;
}

/**
 * Rank -> OVR curve (§11: #1 ~ 95+, #200 ~ 60s).
 * Exponential decay keeps the top compressed (the gap between #1 and #5 is
 * small) while the tail flattens out, which matches how padel strength actually
 * distributes far better than a linear or log ramp.
 */
const OVR_TOP = 96;
const OVR_FLOOR = 61;
const OVR_DECAY = 62;

const ovrFromRank = (rank: number): number =>
  OVR_FLOOR + (OVR_TOP - OVR_FLOOR) * Math.exp(-(rank - 1) / OVR_DECAY);

/** Physical peak; growth headroom runs out here (§4: peaks ~25-30). */
const PEAK_AGE = 27;

interface RawRankingRow {
  player_id: string;
  name: string;
  surname: string;
  rank: number;
  points: number;
  url?: string;
  country_name: string;
  category?: string;
  region?: string;
}

interface RawProfile {
  player_id: string;
  height?: string;
  birthPlace?: string;
  birthDate?: string;
  playingPosition?: string;
  error?: string;
}

const readRaw = <T>(name: string): T => JSON.parse(readFileSync(resolve(RAW, name), "utf8")) as T;

function ageFrom(birthDate: string | undefined): number | null {
  if (!birthDate) return null;
  const dob = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) return null;

  let age = AGE_REFERENCE.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = AGE_REFERENCE.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && AGE_REFERENCE.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

/** FIP's "Playing Position" is the court side: Right = drive, Left = reves. */
function sideFrom(position: string | undefined): Side | null {
  const value = position?.trim().toLowerCase();
  if (value === "right") return "drive";
  if (value === "left") return "reves";
  return null;
}

/**
 * Playstyle is not published anywhere, so it is inferred from the side the
 * player owns — drive players skew to finishers, reves players to builders.
 */
const PLAYSTYLES: Playstyle[] = ["power", "playmaker", "counter", "allcourt"];
const PLAYSTYLE_WEIGHTS: Record<Side, number[]> = {
  drive: [0.5, 0.1, 0.14, 0.26],
  reves: [0.08, 0.44, 0.26, 0.22],
};

function buildAttributes(
  target: number,
  naturalSide: Side,
  playstyle: Playstyle,
  age: number,
  rng: Rng,
): Attributes {
  const sideBias = SIDE_BIAS[naturalSide];
  const styleBias = PLAYSTYLE_BIAS[playstyle];

  // Experience buys composure; legs go first. Both are shape-only — the
  // normalisation below puts the weighted OVR back on target either way.
  const mentalTilt = Math.max(-5, Math.min(5, (age - 24) * 0.6));
  const speedTilt = Math.max(-5, Math.min(6, (PEAK_AGE - age) * 0.7));

  const shaped = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) {
    let value = target + sideBias[key] + styleBias[key] + rng.normal(0, 3);
    if (key === "mental") value += mentalTilt;
    if (key === "velocidad") value += speedTilt;
    shaped[key] = value;
  }

  return normaliseToOvr(shaped, naturalSide, target);
}

/**
 * Hidden cap (§4). Headroom shrinks to nothing at the physical peak, so a 30
 * year old is already at their ceiling while an 18 year old has room to climb.
 */
function potentialFor(ovr: number, age: number, rng: Rng): number {
  const headroom = Math.max(0, PEAK_AGE - age) * 1.25 * rng.range(0.7, 1.35);
  return Math.max(ovr, clampOvr(ovr + headroom));
}

/** One RNG per player, seeded by id, so output is order-independent and stable. */
const rngFor = (kind: string, id: string): Rng => createRng(`padel-sim:${kind}:${id}`);

function baseFields(row: RawRankingRow, profile: RawProfile | undefined, tour: Tour, rng: Rng) {
  const knownAge = ageFrom(profile?.birthDate);
  const knownSide = sideFrom(profile?.playingPosition);
  const naturalSide: Side = knownSide ?? (rng.chance(0.5) ? "drive" : "reves");
  const playstyle = rng.weighted(PLAYSTYLES, PLAYSTYLE_WEIGHTS[naturalSide]);
  const height = profile?.height ? Number.parseFloat(profile.height) : NaN;

  const fullName = `${row.name} ${row.surname}`.replace(/\s+/g, " ").trim();

  return {
    knownAge,
    knownSide,
    naturalSide,
    playstyle,
    common: {
      id: row.player_id,
      name: friendlyName(fullName),
      country: toIsoAlpha2(row.country_name),
      tour,
      naturalSide,
      currentSide: naturalSide,
      playstyle,
      isReal: true as const,
      source: {
        fipId: row.player_id,
        /** As published by FIP, before shortening. */
        fullName,
        fipCountry: row.country_name,
        fipRank: row.rank,
        fipPoints: row.points,
        sideKnown: knownSide !== null,
        ageKnown: knownAge !== null,
        ...(profile?.birthDate ? { birthDate: profile.birthDate } : {}),
        ...(Number.isFinite(height) ? { heightM: height } : {}),
        ...(row.url ? { profileUrl: row.url } : {}),
      },
    },
  };
}

function buildSeniors(tour: Tour, profiles: Map<string, RawProfile>): Player[] {
  const rows = readRaw<{ players: RawRankingRow[] }>(`ranking.${tour}.json`).players;

  // FIP ties partners on equal points (both listed as #1); resolve to a strict
  // 1..N ordering so the OVR curve is monotonic.
  const ordered = [...rows]
    .sort((a, b) => b.points - a.points || a.player_id.localeCompare(b.player_id))
    .slice(0, SENIOR_POOL_SIZE);

  return ordered.map((row, index) => {
    const rng = rngFor("senior", row.player_id);
    const { knownAge, naturalSide, playstyle, common } = baseFields(
      row,
      profiles.get(row.player_id),
      tour,
      rng,
    );

    // Tour pros without a published birth date sit in the typical pro band.
    const age = knownAge ?? Math.round(Math.max(18, Math.min(37, rng.normal(26, 4))));
    const target = clampOvr(ovrFromRank(index + 1));
    const attributes = buildAttributes(target, naturalSide, playstyle, age, rng);

    return {
      ...common,
      attributes,
      potential: potentialFor(target, age, rng),
      age,
      ovr: computeOvr(attributes, naturalSide),
    } satisfies Player;
  });
}

/**
 * Oldest a player can be and still be eligible for each junior ladder.
 * A handful of FIP profiles carry a plainly wrong birth date (one under-16
 * entrant is listed as born in 1989); the ladder they actually compete on is
 * the trustworthy signal, so it overrules a contradictory birth date.
 */
const PROMISE_AGE_CEILING: Record<string, number> = {
  under12: 11,
  under14: 13,
  under16: 15,
  under18: 17,
};

function promiseAge(
  row: RawRankingRow,
  profile: RawProfile | undefined,
  rng: Rng,
): { age: number; known: boolean } {
  const ceiling = PROMISE_AGE_CEILING[row.category ?? ""] ?? 17;
  const knownAge = ageFrom(profile?.birthDate);
  if (knownAge !== null && knownAge <= ceiling && knownAge >= 12) {
    return { age: knownAge, known: true };
  }
  return { age: rng.int(Math.max(13, ceiling - 2), ceiling), known: false };
}

/**
 * Promise curve: juniors are strong for their age but not yet tour-level, so
 * their present OVR is modest while their ceiling is the highest in the game.
 */
const promiseOvr = (index: number, age: number): number =>
  58 - (16 * index) / Math.max(1, PROMISE_POOL_SIZE - 1) - Math.max(0, 18 - age) * 2.5;

const promisePotential = (index: number): number => 70 + 22 * Math.exp(-index / 25);

function buildPromises(tour: Tour, profiles: Map<string, RawProfile>): Player[] {
  const rows = readRaw<{ players: RawRankingRow[] }>(`promises.${tour}.json`).players;

  // The same junior appears on several regional/age ladders; keep their best row.
  const best = new Map<string, RawRankingRow>();
  for (const row of rows) {
    const prev = best.get(row.player_id);
    if (!prev || row.points > prev.points) best.set(row.player_id, row);
  }

  const ordered = [...best.values()]
    .sort((a, b) => b.points - a.points || a.player_id.localeCompare(b.player_id))
    // Under-12s would be past their prime before they ever debut in a 16->35 career.
    .filter((row) => row.category !== "under12" && row.category !== "under14")
    .slice(0, PROMISE_POOL_SIZE);

  return ordered.map((row, index) => {
    const rng = rngFor("promise", row.player_id);
    const profile = profiles.get(row.player_id);
    const { naturalSide, playstyle, common } = baseFields(row, profile, tour, rng);

    const { age, known: ageKnown } = promiseAge(row, profile, rng);
    const target = clampOvr(promiseOvr(index, age));
    const attributes = buildAttributes(target, naturalSide, playstyle, age, rng);

    // They join the active pool as they turn ~18, staggered by a year so the
    // late-career world keeps refreshing rather than arriving all at once (§11).
    const debutYear = SNAPSHOT_YEAR + Math.max(0, 18 - age) + rng.int(0, 1);

    return {
      ...common,
      source: { ...common.source, ageKnown },
      attributes,
      potential: Math.max(target, clampOvr(promisePotential(index) + rng.normal(0, 2.5))),
      age,
      ovr: computeOvr(attributes, naturalSide),
      debutYear,
    } satisfies Player;
  });
}

function write(name: string, file: PlayerPoolFile) {
  writeFileSync(resolve(OUT, name), JSON.stringify(file, null, 2) + "\n", "utf8");
  const known = file.players.filter((p) => p.source?.sideKnown).length;
  const ovrs = file.players.map((p) => p.ovr);
  console.log(
    `  data/${name}: ${file.players.length} players, ` +
      `OVR ${Math.min(...ovrs)}-${Math.max(...ovrs)}, real sides ${known}`,
  );
}

function main() {
  for (const tour of ["men", "women"] as Tour[]) {
    console.log(`${tour}:`);

    const rawProfiles = readRaw<{ profiles: RawProfile[] }>(`profiles.${tour}.json`).profiles;
    const profiles = new Map(rawProfiles.map((p) => [p.player_id, p]));
    const meta = readRaw<{ year: number; week: number; fetchedAt: string }>(`ranking.${tour}.json`);
    const source = {
      provider: "padelfip.com",
      year: meta.year,
      week: meta.week,
      fetchedAt: meta.fetchedAt,
    };

    write(`players.${tour}.json`, {
      tour,
      kind: "senior",
      source,
      players: buildSeniors(tour, profiles),
    });
    write(`promises.${tour}.json`, {
      tour,
      kind: "promise",
      source,
      players: buildPromises(tour, profiles),
    });
  }
}

main();
