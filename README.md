# Padel Career Simulator

A browser-based, decision-driven padel career simulator. You start at 16 with raw
potential and grind from FIP Bronze tournaments up to Premier Padel. You never play
points — you make **career decisions** (partners, side, circuit, training, injuries,
sponsors) and a seeded simulation resolves each tournament and season. A career runs
16 → 35 and ends in a shareable summary card.

A full career takes about two minutes.

> **Unofficial fan-made simulator.** Not affiliated with, endorsed by, or connected to
> the FIP (International Padel Federation), Premier Padel, or any player. Player names,
> countries, rankings and tournament calendars are real public data; **all ratings,
> attributes, potentials and playstyles are invented estimates for gameplay purposes.**

The full specification is in [PADEL_SIM_PLAN.md](PADEL_SIM_PLAN.md).

## Running it

```bash
npm install
npm run dev          # http://localhost:3000 → redirects to /en
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Unit tests (sim engine, i18n catalogs, data schemas) |
| `npm run smoke` | Drives a real browser through a full career in every locale |
| `npm run sim` | Plays careers headlessly — `-- --runs=200` for a balance sweep |
| `npm run data:build` | Regenerates `/data` from the raw FIP snapshots, then validates |
| `npm run data:fetch` | Re-scrapes padelfip.com into `data/raw` (network) |
| `npm run typecheck` | `tsc --noEmit` |

`npm run smoke` needs a server already running (`npm run dev`) and Playwright's
Chromium (`npx playwright install chromium`).

## How it is put together

```
/app/[locale]      landing · /play (creator → board → result)
/app/api/og        localised OG share image (Satori)
/components        UI — every string comes from the message catalog
/lib/sim           the engine: pure TypeScript, no React, no prose
/lib/data          schemas + static data loading
/messages          en.json · pt.json · es.json
/data              real player pools, calendars, points tables (see data/README.md)
/scripts           scrapers, data builders, validator, headless runners
```

**The engine is language-agnostic.** `/lib/sim` emits *keys* (`events.train_harder.title`,
`tags.ovr_down`), never sentences; the UI resolves them per locale. That is what lets the
whole decision system ship in three languages with zero engine changes, and it is enforced
by a test — [`lib/i18n/messages.test.ts`](lib/i18n/messages.test.ts) fails if any locale is
missing a key the engine can emit, or if interpolation variables drift between languages.

**Everything is seeded.** One seed string drives an entire career, so the same seed always
replays identically. The seed is shown on the result card.

**Everything is client-side.** No accounts, no database, no career state on the server.
The only server route is the OG image.

### Adding a language

Copy `messages/en.json` to `messages/<code>.json`, translate the values, and add the code
to `LOCALES` in [`lib/i18n/routing.ts`](lib/i18n/routing.ts). Nothing else changes —
`npm test` will tell you if you missed a key. Padel vocabulary (*bandeja*, *víbora*,
*revés*, *drive*, *remate*) deliberately stays in Spanish in every language.

## Data

The player pools and calendars are real, scraped from padelfip.com (ranking week 31 of
2026): 200 ranked players and 50 NextGen juniors per tour, the 25-event Premier Padel
season and 235 CUPRA FIP Tour events. Ratings are derived from FIP ranking by a documented
curve. See [data/README.md](data/README.md) for what is real, what is derived, and the
upstream quirks that are worked around.

## Deploying

Zero-config on Vercel — import the repo and deploy. There is no database, no environment
variable and no build step beyond `next build`; `/data` is committed, so the build is
reproducible offline.

## Licence

MIT — see [LICENSE](LICENSE).
