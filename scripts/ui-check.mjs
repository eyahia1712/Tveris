// Drives the dashboard in headless Chrome and saves screenshots of the key
// interactions: node -e / npm run ui:check (needs a running server).
import puppeteer from "puppeteer-core";

const base = process.env.TVERIS_URL ?? "http://localhost:3100";
const out = process.env.OUT ?? ".";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await page.goto(`${base}/`, { waitUntil: "networkidle0" });
await wait(2500);
// Open a mismatch email on the map: click the first red email dot.
const clicked = await page.evaluate(() => {
  const button = [...document.querySelectorAll("button[aria-label^='Email 004']")][0];
  if (!button) return false;
  const rect = button.getBoundingClientRect();
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
});
if (clicked) {
  await page.mouse.click(clicked.x, clicked.y);
  await wait(2500);
}
await page.screenshot({ path: `${out}/ui-email.png` });

// Hover a hub.
const hub = await page.evaluate(() => {
  const button = document.querySelector("button[aria-label^='Invoice query']");
  if (!button) return null;
  const rect = button.getBoundingClientRect();
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
});
if (hub) {
  await page.keyboard.press("Escape");
  await page.mouse.click(hub.x, hub.y);
  await wait(1200);
  await page.screenshot({ path: `${out}/ui-hub.png` });
}

// Queue view.
await page.keyboard.press("Escape");
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Queue")?.click());
await wait(800);
await page.screenshot({ path: `${out}/ui-queue.png` });

// Email page and report.
await page.goto(`${base}/emails/email_004`, { waitUntil: "networkidle0" });
await page.screenshot({ path: `${out}/ui-email-page.png`, fullPage: false });
await page.goto(`${base}/report`, { waitUntil: "networkidle0" });
await page.screenshot({ path: `${out}/ui-report.png` });
await page.goto(`${base}/connect`, { waitUntil: "networkidle0" });
await page.screenshot({ path: `${out}/ui-connect.png` });

// Narrow screen.
await page.setViewport({ width: 400, height: 860 });
await page.goto(`${base}/`, { waitUntil: "networkidle0" });
await wait(2000);
await page.screenshot({ path: `${out}/ui-mobile.png` });

console.log(JSON.stringify({ clicked: Boolean(clicked), hub: Boolean(hub), errors }, null, 2));
await browser.close();
