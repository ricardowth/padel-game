/**
 * Verifies the emoji the UI actually uses render as colour glyphs, not tofu.
 *
 * Eyeballing a screenshot is unreliable — a missing glyph and a monochrome one
 * look similar at small sizes. Instead this renders each emoji inside the real
 * page (so the app's font stack applies), screenshots it, and measures pixel
 * saturation: a colour emoji is saturated, a tofu box or a monochrome fallback
 * is grey. It also reports the font the browser actually resolved.
 *
 *   node scripts/check-emoji.mjs [baseUrl]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";

/** Every pictographic glyph the UI renders, and where it appears. */
const EMOJI = [
  { char: "🏆", where: "ResultCard — partnership trophies" },
  { char: "🥇", where: "ResultCard — World Championship golds" },
  { char: "🏅", where: "ResultCard — awards heading" },
  { char: "🌍", where: "CareerLedger + ResultCard — World Championship" },
  { char: "🔻", where: "tags.ovr_down / tags.side_switch" },
];

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
  await page.goto(`${BASE}/en`, { waitUntil: "networkidle" });

  // Render the probes inside the live page so globals.css applies to them.
  await page.evaluate((list) => {
    const host = document.createElement("div");
    host.id = "emoji-probe";
    host.style.cssText =
      "position:fixed;top:0;left:0;z-index:99999;display:flex;background:#fff";
    for (const { char } of list) {
      const cell = document.createElement("span");
      cell.className = "emoji-cell";
      cell.textContent = char;
      cell.style.cssText = "font-size:64px;line-height:1;padding:4px";
      host.appendChild(cell);
    }
    document.body.appendChild(host);
  }, EMOJI);

  await page.waitForTimeout(300);

  const results = [];
  for (let i = 0; i < EMOJI.length; i++) {
    const cell = page.locator("#emoji-probe .emoji-cell").nth(i);

    const font = await cell.evaluate((el) => getComputedStyle(el).fontFamily);
    const shot = await cell.screenshot();

    // Decode the PNG without a dependency: draw it back into a canvas.
    const stats = await page.evaluate(async (bytes) => {
      const blob = new Blob([new Uint8Array(bytes)], { type: "image/png" });
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

      let coloured = 0;
      let ink = 0;
      for (let p = 0; p < data.length; p += 4) {
        const [r, g, b] = [data[p], data[p + 1], data[p + 2]];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max < 250 || min < 250) ink++; // anything not pure white
        if (max - min > 40) coloured++; // meaningfully saturated
      }
      return { coloured, ink, total: data.length / 4 };
    }, [...shot]);

    const colourRatio = stats.ink > 0 ? stats.coloured / stats.ink : 0;
    results.push({
      ...EMOJI[i],
      font: font.split(",").slice(-2).join(",").trim(),
      inkRatio: stats.ink / stats.total,
      colourRatio,
      ok: stats.ink / stats.total > 0.02 && colourRatio > 0.25,
    });
  }

  await page.locator("#emoji-probe").screenshot({ path: "scripts/.screenshots/emoji.png" });
  await browser.close();

  console.log("glyph  colour  ink    verdict  where");
  for (const r of results) {
    console.log(
      `${r.char}      ${(r.colourRatio * 100).toFixed(0).padStart(3)}%  ` +
        `${(r.inkRatio * 100).toFixed(0).padStart(3)}%   ` +
        `${r.ok ? "OK     " : "FAIL   "}  ${r.where}`,
    );
  }
  console.log(`\nresolved font tail: ${results[0]?.font}`);

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} glyph(s) not rendering in colour: ${failed.map((f) => f.char).join(" ")}`);
    process.exit(1);
  }
  console.log("\nAll UI emoji render as colour glyphs.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
