import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer";

await mkdir("artifacts", { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--disable-gpu"] });

try {
  const [page] = await browser.pages();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  if (await page.$(".auth-card")) {
    await page.type('input[name="identifier"]', "maya");
    await page.type('input[name="password"]', "northstar");
    await page.click('button[type="submit"]');
  }
  await page.waitForSelector(".world-canvas canvas", { visible: true, timeout: 30_000 });
  await page.waitForFunction(
    () => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected",
    { timeout: 30_000 },
  );
  for (let index = 0; index < 4; index += 1) {
    await page.click('button[aria-label="Zoom out"]');
  }
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  const canvas = await page.$(".world-canvas canvas");
  await canvas.screenshot({ path: "artifacts/current-studio.png" });
  await page.select('select[aria-label="Floor"]', "floor-rooftop");
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  await canvas.screenshot({ path: "artifacts/current-rooftop.png" });
  process.stdout.write("Captured current Studio and Rooftop maps.\n");
} finally {
  await browser.close();
}
