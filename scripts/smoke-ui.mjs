/**
 * End-to-end smoke test: drive a real browser through a whole career.
 *
 * The sim has unit tests; this checks the thing the unit tests cannot — that
 * the screens wire up, that every string resolves in both locales, and that a
 * career can actually be played from the landing page to the result card.
 *
 *   node scripts/smoke-ui.mjs [baseUrl]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";
const SHOTS = "scripts/.screenshots";

const problems = [];
const note = (msg) => console.log(`  ${msg}`);

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // Any missing translation key surfaces as a console error from next-intl.
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

  for (const locale of ["en", "pt", "es"]) {
    console.log(`\n[${locale}] landing`);
    await page.goto(`${BASE}/${locale}`, { waitUntil: "networkidle" });

    const heading = await page.locator("h1").first().textContent();
    note(`h1: ${heading?.trim()}`);
    if (!heading?.trim()) problems.push(`${locale}: empty landing heading`);

    await page.screenshot({ path: `${SHOTS}/${locale}-1-landing.png` });

    console.log(`[${locale}] creator`);
    await page.getByRole("button", { name: /start career|começar carreira|empezar carrera/i }).click();
    await page.waitForURL(/\/play/);
    await page.waitForSelector("input", { timeout: 20_000 });

    await page.locator("input").first().fill("Sampo Martinez");
    // Pick a country, a side and a style to prove the controls are wired.
    await page.getByRole("button", { name: /^Argentina$/ }).click();
    await page.getByRole("button", { name: /^(revés|reves)$/i }).first().click();
    await page.screenshot({ path: `${SHOTS}/${locale}-2-creator.png` });

    const previewOvr = await page.locator(".num").first().textContent();
    note(`starting OVR preview: ${previewOvr?.trim()}`);

    console.log(`[${locale}] career`);
    await page.getByRole("button", { name: /confirm identity|confirmar identidade|confirmar identidad/i }).click();

    // Play the whole career by always taking the first option.
    let decisions = 0;
    const deadline = Date.now() + 120_000;

    for (;;) {
      if (Date.now() > deadline) {
        problems.push(`${locale}: career did not finish inside 120s`);
        break;
      }

      // The result screen is identified by its "Play again" action.
      const done = await page
        .getByRole("link", { name: /play again|jogar outra vez|jugar otra vez/i })
        .isVisible()
        .catch(() => false);
      if (done) break;

      // Either a decision card or an outcome acknowledgement is on screen.
      const next = page.getByRole("button", { name: /^(next|seguinte|siguiente)$/i });
      if (await next.isVisible().catch(() => false)) {
        await next.click();
        continue;
      }

      const option = page.locator("button.group").first();
      if (await option.isVisible().catch(() => false)) {
        if (decisions === 0) {
          await page.screenshot({ path: `${SHOTS}/${locale}-3-board.png` });
        }
        await option.click();
        decisions++;
        continue;
      }

      await page.waitForTimeout(120);
    }

    note(`decisions taken: ${decisions}`);
    if (decisions < 10) problems.push(`${locale}: only ${decisions} decisions in a full career`);

    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/${locale}-4-result.png`, fullPage: true });

    const tier = await page
      .locator("main p.text-lg.font-black")
      .first()
      .textContent()
      .catch(() => null);
    note(`legacy tier: ${tier?.trim()}`);
  }

  // A raw key leaking into the DOM means a missing translation.
  const body = await page.locator("body").innerText();
  const leaked = body.match(/\b(events|tags|board|result|creator)\.[a-z_.]+/gi);
  if (leaked) problems.push(`untranslated keys rendered: ${[...new Set(leaked)].join(", ")}`);

  const realErrors = consoleErrors.filter(
    (e) => !/DevTools|Download the React/i.test(e),
  );
  if (realErrors.length > 0) {
    problems.push(`console errors:\n    ${[...new Set(realErrors)].slice(0, 5).join("\n    ")}`);
  }

  await browser.close();

  console.log("\n" + "-".repeat(60));
  if (problems.length > 0) {
    console.error(`FAILED (${problems.length}):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log("UI smoke test passed. Screenshots in scripts/.screenshots/");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
