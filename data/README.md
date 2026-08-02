# /data — Phase 0 reference data

Everything the simulation reads is static JSON in this folder. No API is called at
runtime.

> **Unofficial fan-made simulator.** Not affiliated with, endorsed by, or connected to
> the FIP (International Padel Federation), Premier Padel, or any player. Player names,
> countries, rankings and tournament calendars are real public data; **all ratings,
> attributes, potentials and playstyles are invented estimates for gameplay purposes and
> do not represent any real assessment of any player.**

## Files

| File | What it is |
|---|---|
| `players.men.json` / `players.women.json` | Top 200 real FIP-ranked players per tour |
| `promises.men.json` / `promises.women.json` | 300 NextGen juniors per tour, with `debutYear` staggered across a full career |
| `calendar.premier.json` | Premier Padel 2026 — 25 events (5 Majors, 10 P1, 9 P2, Finals) |
| `calendar.fip.json` | CUPRA FIP Tour 2026 — 235 events (150 Bronze, 68 Silver, 12 Gold, 5 Platinum) |
| `points.json` | Points- and prize-by-round-by-category tables (**hand-authored tuning data**) |
| `raw/` | Untouched scrape output, committed so the build reproduces offline |

Schemas live in [`lib/data/types.ts`](../lib/data/types.ts) and
[`lib/data/points.ts`](../lib/data/points.ts).

## Regenerating

```bash
npm run data:fetch      # re-scrape padelfip.com into data/raw (network)
npm run data:build      # derive data/*.json from data/raw, then validate
npm run data:validate   # schema + balance checks only
```

`data:build` is deterministic — the same `data/raw` snapshot always produces
byte-identical output, because every random draw is seeded by the player's FIP id.

## What is real vs. derived

**Real** (scraped from padelfip.com, ranking week 31 of 2026):

- Names, countries, FIP rank and points.
- Birth dates for **all 400** ranked seniors and ~28 of the 300 juniors on each tour.
- Court side for the 108 players whose "Playing Position" FIP publishes
  (`Right` → `drive`, `Left` → `reves`). `source.sideKnown` flags these.
- Every tournament's name, host city, country, category and dates.

**Derived / invented** (see [`scripts/build-data.ts`](../scripts/build-data.ts)):

- **OVR** from FIP rank via an exponential curve — #1 ≈ 96, #50 ≈ 78, #100 ≈ 69,
  #200 ≈ 62. Exponential (not linear) because the gap between #1 and #5 is genuinely
  small while the tail is flat.
- **Attributes** — the target OVR is shaped by side bias, playstyle bias, an
  age tilt (veterans gain `mental`, lose `velocidad`), and seeded jitter, then rescaled
  so the weighted OVR lands exactly back on target.
- **Playstyle** — inferred from side (drive skews to finishers, revés to builders).
- **Court side** for the ~73% of players FIP does not publish it for.
- **Potential** — headroom that shrinks to zero at age 27.
- **Debut year** (juniors only) — they join the tour as they turn ~18, plus a year for
  each wave of 20 further down the junior ladder. Without that stagger the whole 300
  would arrive inside six seasons and the back half of a career would be played against
  generated names.
- **Points and prize money** — `points.json`, anchored on the plan's §7 winner-points
  table and the real Premier Padel round breakdown (2000/1200/720/360/180/90/45).

## Known upstream data quirks

Handled in the build; documented here so they are not re-discovered later.

- **The Qatar Major is listed POSTPONED with no date.** Restored to its originally
  scheduled 6–11 April window so the Major slate is complete. This is the only date in
  either calendar that is not taken verbatim from FIP.
- **Some junior profiles carry impossible birth dates** — one under-16 entrant is listed
  as born in 1989. The ladder a junior actually competes on caps their age, so a
  contradictory birth date is discarded and `source.ageKnown` is set to `false`.
- **A few events omit the country** (one FIP Silver in Belfast) or write a US state
  instead ("Arizona US"). Both are patched by lookup table.
- **`Intl.DisplayNames` maps the deprecated `FX` code to "France"**, which will shadow
  `FR` in a naive name→code inversion. The builder takes the first (canonical) code.
- **FIP ties partners on equal points** (both listed as #1). The build re-sorts to a
  strict 1..200 order so the OVR curve stays monotonic.

## Tuning

The JSON is meant to be edited. Attributes are estimates — if a player's profile feels
wrong, change it directly; `npm run data:validate` will confirm the file is still
internally consistent (it re-checks that `ovr` matches `attributes` under the side
weights). Re-running `data:build` overwrites hand edits.
