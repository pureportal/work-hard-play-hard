import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { ASSET_CATALOG, getDefaultAssetVariantId, getPlacedAssetBounds } from "../../packages/shared/src/index.js";
import { createRecorder } from "./capture.js";
import { createReviewFixture } from "./fixture.js";

const review = createRecorder(`../../artifacts/application-design-review/${process.env.REVIEW_PHASE ?? "before"}/world`);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const position = { x: 720, y: 650 };
const seat = ASSET_CATALOG.assets.find((asset) => asset.name === "Round ottoman")!;
try {
  for (const [width, height] of [[1440, 1000], [390, 844], [320, 568], [844, 390]]) {
    const fixture = await createReviewFixture();
    fixture.position(position.x, position.y);
    const layout = fixture.store.getLayout("floor-studio")!;
    layout.objects = [{ id: "review-seat", floorId: layout.floorId, assetId: seat.id, variantId: getDefaultAssetVariantId(seat), rotation: 0,
      x: 720, y: Math.round((position.y + (110 - height! / 2) / .78) / 16) * 16 }];
    layout.revision++;
    const context = await browser.newContext({ viewport: { width: width!, height: height! } });
    await fixture.install(context, "maya");
    const page = await context.newPage();
    review.observe(page);
    try {
      await page.goto("http://127.0.0.1:5173");
      await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
      const close = page.getByRole("button", { name: "Close people", exact: true });
      if (await close.count()) await close.click();
      await page.locator(".world-canvas canvas").waitFor();
      await page.evaluate(async () => { for (let index = 0; index < 40; index++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
      const canvas = (await page.locator(".world-canvas canvas").boundingBox())!;
      const bounds = getPlacedAssetBounds(layout.objects[0]!);
      const point = { x: canvas.x + canvas.width / 2 + (bounds.x + bounds.width / 2 - position.x) * .78,
        y: canvas.y + canvas.height / 2 + (bounds.y + bounds.height / 2 - position.y) * .78 };
      for (const theme of ["light", "dark"]) {
        const toggle = page.getByRole("button", { name: `Use ${theme} mode`, exact: true });
        if (await toggle.count()) await toggle.click();
        await page.mouse.click(point.x, point.y);
        await page.getByRole("region", { name: "Selected place", exact: true }).waitFor();
        await review.capture(page, `${width}-${theme}-top-selection`);
        if (process.env.REVIEW_PHASE === "after") {
          const menu = (await page.locator(".world-actions.contextual").boundingBox())!;
          const topBar = (await page.locator(".top-bar").boundingBox())!;
          const dock = (await page.locator(".control-dock").boundingBox())!;
          assert(menu.y >= topBar.y + topBar.height + 11);
          assert(menu.y + menu.height <= dock.y - 11);
          assert(menu.x >= canvas.x + 11 && menu.x + menu.width <= canvas.x + canvas.width - 11);
        }
        await page.getByRole("button", { name: "Clear selection", exact: true }).click();
      }
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
      await page.getByRole("button", { name: "Zoom out", exact: true }).click();
      await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
      await page.mouse.down({ button: "middle" });
      await page.mouse.move(canvas.x + canvas.width / 2 - 60, canvas.y + canvas.height / 2 + 30);
      await page.mouse.up({ button: "middle" });
      await review.capture(page, `${width}-camera`);
    } catch (error) {
      review.blockers.push(`${width}: ${String(error)}`);
      await review.capture(page, `${width}-failure`);
      console.error(String(error));
    } finally {
      await context.close();
      await fixture.stop();
      await review.save();
    }
  }
} finally {
  await browser.close();
  await review.save();
}
