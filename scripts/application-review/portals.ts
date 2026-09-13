import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { getCorrespondingFloorPortals, getFloorPortals, getOutdoorBounds } from "../../packages/shared/src/index.js";
import { createRecorder } from "./capture.js";
import { createReviewFixture } from "./fixture.js";

const review = createRecorder("../../artifacts/application-design-review/after/portals");
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const [width, height] of [[1440, 1000], [390, 844], [320, 568], [844, 390]]) {
    for (const theme of ["light", "dark"] as const) {
      const fixture = await createReviewFixture();
      const data = fixture.store.getBootstrap("user-maya");
      const portals = getFloorPortals(data.floors, data.layouts);
      const portal = portals.find((item) => item.floorId === "floor-studio")!;
      assert(portal, "A linked floor portal must exist");
      assert(getCorrespondingFloorPortals(portals, portal).length > 0);
      const position = { x: portal.position.x - 64, y: portal.position.y };
      fixture.position(position.x, position.y);
      assert.equal(fixture.runtime.serializePlayers().find((player) => player.userId === "user-maya")!.x, position.x);
      const context = await browser.newContext({ viewport: { width: width!, height: height! }, colorScheme: theme });
      await fixture.install(context, "maya");
      const page = await context.newPage();
      review.observe(page);
      const prefix = `${width}-${theme}`;
      try {
        await page.goto("http://127.0.0.1:5173");
        await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
        const close = page.getByRole("button", { name: "Close people", exact: true });
        if (await close.count()) await close.click();
        await page.waitForLoadState("networkidle");
        await page.evaluate(async () => { for (let index = 0; index < 40; index++) await new Promise<void>((done) => requestAnimationFrame(() => done())); });
        const canvas = (await page.locator(".world-canvas canvas").boundingBox())!;
        const bounds = getOutdoorBounds(data.floors.find((floor) => floor.id === portal.floorId)!);
        const halfWidth = canvas.width / .78 / 2;
        const halfHeight = canvas.height / .78 / 2;
        const cameraX = Math.max(bounds.x + halfWidth, Math.min(bounds.x + bounds.width - halfWidth, position.x));
        const cameraY = Math.max(bounds.y + halfHeight, Math.min(bounds.y + bounds.height - halfHeight, position.y));
        await page.mouse.click(canvas.x + canvas.width / 2 + (portal.position.x - cameraX) * .78,
          canvas.y + canvas.height / 2 + (portal.position.y - cameraY) * .78);
        await page.getByRole("button", { name: "Go", exact: true }).waitFor();
        await review.capture(page, `${prefix}-portal`);
        await page.getByRole("button", { name: "Go", exact: true }).click();
        await page.waitForFunction((floorId) => document.querySelector<HTMLSelectElement>('[aria-label="Floor"]')?.value === floorId, portal.destinationFloorId);
        assert.equal(fixture.runtime.serializePlayers().find((player) => player.userId === "user-maya")!.floorId, portal.destinationFloorId);
        await page.waitForLoadState("networkidle");
        await review.capture(page, `${prefix}-arrived`);
      } catch (error) {
        review.blockers.push(`${prefix}: ${String(error)}`);
        await review.capture(page, `${prefix}-failure`);
        console.error(String(error));
      } finally {
        await context.close();
        await fixture.stop();
        await review.save();
      }
    }
  }
} finally {
  await browser.close();
  await review.save();
}
