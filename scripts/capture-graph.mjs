/**
 * Capture the inbox map with every group opened, for the landing page.
 *   node scripts/capture-graph.mjs [url] [outfile]
 * Needs a running server and Chrome installed.
 */
import puppeteer from "puppeteer-core";

const base = process.argv[2] ?? "http://localhost:3000";
const out = process.argv[3] ?? "public/shots/graph-all.png";

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  defaultViewport: { width: 1800, height: 1200, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
await page.goto(`${base}/inbox`, { waitUntil: "networkidle0" });
await new Promise((resolve) => setTimeout(resolve, 2500));

// Open every group: all 520 emails on the map.
await page.evaluate(() => {
  const button = [...document.querySelectorAll("button")].find((element) => element.textContent?.trim() === "Open all");
  button?.click();
});
await new Promise((resolve) => setTimeout(resolve, 9000));

// The picture is the map alone: no rail, no chrome, no overlays.
await page.addStyleTag({
  content: `aside, header, .xv-no-print { display: none !important; }
            main { width: 100vw !important; }`,
});
await new Promise((resolve) => setTimeout(resolve, 4000));
const canvas = await page.$("[role='application']");
await (canvas ?? page).screenshot({ path: out });
console.log(`saved ${out}`);
await browser.close();
