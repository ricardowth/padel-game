/**
 * Phase 1 gate — run full careers headlessly, with no UI (§15, §18).
 *
 *   npx tsx scripts/sim-career.ts                       one narrated career
 *   npx tsx scripts/sim-career.ts --seed=abc --tour=women
 *   npx tsx scripts/sim-career.ts --runs=200            balance sweep
 *
 * The AI picks options at random (weighted to "do something"), which is the
 * harshest test: if the numbers only hold up under optimal play, they are wrong.
 */
import { loadTourData } from "../lib/data/load";
import type { Playstyle, Side, Tour } from "../lib/data/types";
import { CareerEngine, definingPartnerships, legacyTier, peakRank } from "../lib/sim/career";
import { createRng } from "../lib/sim/rng";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, v = "true"] = arg.replace(/^--/, "").split("=");
    return [k!, v] as const;
  }),
);

const seedArg = args.get("seed") ?? "phase1";
const tour = (args.get("tour") ?? "men") as Tour;
const runs = Number(args.get("runs") ?? 1);
const verbose = runs === 1 && args.get("quiet") !== "true";

const SIDES: Side[] = ["drive", "reves"];
const STYLES: Playstyle[] = ["power", "playmaker", "counter", "allcourt"];

const euro = (n: number) =>
  n >= 1_000_000 ? `€${(n / 1_000_000).toFixed(1)}M` : `€${Math.round(n / 1000)}k`;

async function runCareer(seed: string) {
  const data = await loadTourData(tour);
  const rng = createRng(`${seed}:choices`);

  const engine = new CareerEngine({
    data,
    seed,
    pace: "story",
    input: {
      name: "Sampo Martinez",
      country: "AR",
      tour,
      side: rng.pick(SIDES),
      playstyle: rng.pick(STYLES),
      handedness: rng.chance(0.15) ? "left" : "right",
    },
  });

  let decisions = 0;
  let guard = 0;

  for (;;) {
    if (guard++ > 5000) throw new Error("career did not terminate");

    const { pending, done } = engine.advance();
    if (done) break;

    if (pending) {
      decisions++;
      // Bias slightly toward the first option (usually the active choice).
      const weights = pending.options.map((_, i) => (i === 0 ? 1.6 : 1));
      const choice = rng.weighted(pending.options, weights);

      if (verbose) {
        console.log(
          `  [${engine.state.year}] ${pending.eventId} -> ${choice.id}` +
            (choice.partnerId ? ` (${engine.world.players.get(choice.partnerId)?.name})` : ""),
        );
      }
      engine.choose(choice.id);
    }
  }

  return { engine, decisions };
}

function summarise(engine: CareerEngine) {
  const s = engine.state;
  return {
    tier: legacyTier(s),
    peak: peakRank(s),
    titles: s.titles,
    finals: s.finals,
    earnings: s.earnings,
    seasons: s.history.length,
    majors: s.awards.filter((a) => a.type === "major").length,
    no1: s.awards.filter((a) => a.type === "fip_no1").length,
    finalOvr: s.you.ovr,
    partners: s.partnerships.length,
    banned: s.retiredReason === "ban",
  };
}

async function main() {
  if (runs === 1) {
    const started = Date.now();
    const { engine, decisions } = await runCareer(seedArg);
    const elapsed = Date.now() - started;
    const s = engine.state;

    console.log(`\nCareer — seed "${seedArg}", ${tour}'s tour, ${elapsed}ms, ${decisions} decisions\n`);
    console.log("AGE  YEAR  PARTNER                    SIDE  OVR  TTL  RANK      €  BAND");
    for (const row of s.history) {
      const partner = row.partnerId ? engine.world.players.get(row.partnerId)?.name : "—";
      console.log(
        `${String(row.age).padStart(3)}  ${row.year}  ${(partner ?? "—").slice(0, 24).padEnd(25)} ` +
          `${row.side === "drive" ? "DR" : "RV"}${row.sidePenalised ? "*" : " "}  ` +
          `${String(row.ovr).padStart(3)}  ${String(row.titles).padStart(3)}  ` +
          `${row.rank > 0 ? `#${row.rank}`.padStart(5) : "    —"}  ${euro(row.earnings).padStart(6)}  ${row.band.slice(0, 4)}`,
      );
    }

    const summary = summarise(engine);
    console.log(
      `\nLEGACY: ${summary.tier.toUpperCase()} · peak #${summary.peak} · ` +
        `${summary.titles} titles · ${summary.finals} finals · ${euro(summary.earnings)} · ` +
        `final OVR ${summary.finalOvr}`,
    );
    console.log(
      `Awards: ${s.awards.length === 0 ? "EMPTY TROPHY CASE" : [...new Set(s.awards.map((a) => a.type))].join(", ")}`,
    );
    console.log("Defining partnerships:");
    for (const p of definingPartnerships(engine.state).slice(0, 4)) {
      console.log(
        `  ${(engine.world.players.get(p.partnerId)?.name ?? p.partnerId).padEnd(26)} ` +
          `${p.seasonsTogether} seasons · ${p.titles} titles · ${p.finals} finals`,
      );
    }
    return;
  }

  // Balance sweep.
  const started = Date.now();
  const results: ReturnType<typeof summarise>[] = [];
  for (let i = 0; i < runs; i++) results.push(summarise((await runCareer(`${seedArg}-${i}`)).engine));
  const elapsed = Date.now() - started;

  const num = (pick: (r: (typeof results)[number]) => number) =>
    results.map(pick).sort((a, b) => a - b);
  const pct = (values: number[], p: number) => values[Math.floor(values.length * p)] ?? 0;
  const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;

  const peaks = num((r) => r.peak);
  const titles = num((r) => r.titles);
  const earnings = num((r) => r.earnings);
  const ovrs = num((r) => r.finalOvr);

  console.log(`\n${runs} careers · ${elapsed}ms · ${(elapsed / runs).toFixed(0)}ms each\n`);
  console.log("                    p10     p50     p90    mean");
  const row = (label: string, v: number[], fmt = (n: number) => String(Math.round(n))) =>
    console.log(
      `${label.padEnd(18)}${fmt(pct(v, 0.1)).padStart(7)}${fmt(pct(v, 0.5)).padStart(8)}` +
        `${fmt(pct(v, 0.9)).padStart(8)}${fmt(mean(v)).padStart(8)}`,
    );

  row("peak rank", peaks);
  row("titles", titles);
  row("final OVR", ovrs);
  row("earnings", earnings, (n) => euro(n));

  const tiers = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.tier] = (acc[r.tier] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `\nlegacy tiers: ${Object.entries(tiers)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${((v / runs) * 100).toFixed(0)}%`)
      .join(" · ")}`,
  );
  console.log(
    `reached #1: ${((results.filter((r) => r.peak === 1).length / runs) * 100).toFixed(0)}% · ` +
      `won a Major: ${((results.filter((r) => r.majors > 0).length / runs) * 100).toFixed(0)}% · ` +
      `banned: ${((results.filter((r) => r.banned).length / runs) * 100).toFixed(0)}%`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
