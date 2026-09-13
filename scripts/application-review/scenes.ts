import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { ASSET_CATALOG, getDefaultAssetVariantId, getPlacedAssetBounds, getRoomDoorPosition, type Door } from "../../packages/shared/src/index.js";
import { createRecorder } from "./capture.js";
import { createReviewFixture } from "./fixture.js";

const review = createRecorder("../../artifacts/application-design-review/after/scenes");
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const [width, height] of [[1440, 1000], [390, 844], [320, 568], [844, 390]]) {
    for (const theme of ["light", "dark"] as const) {
      const fixture = await createReviewFixture();
      const layout = fixture.store.getLayout("floor-studio")!;
      const gong = ASSET_CATALOG.assets.find((asset) => asset.kind === "gong")!;
      layout.objects = [{ id: "review-gong", floorId: layout.floorId, assetId: gong.id, variantId: getDefaultAssetVariantId(gong), rotation: 0, x: 736, y: 560 }];
      layout.revision++;
      fixture.position(720, 650);
      fixture.position(656, 650, "user-leo");
      const context = await browser.newContext({ viewport: { width: width!, height: height! }, colorScheme: theme });
      await fixture.install(context, "maya");
      const page = await context.newPage();
      review.observe(page);
      const prefix = `${width}-${theme}`;
      try {
        await page.goto("http://127.0.0.1:5173");
        await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
        await page.waitForLoadState("networkidle");
        const close = page.getByRole("button", { name: "Close people", exact: true });
        if (await close.count()) await close.click();
        await page.evaluate(async () => { for (let index = 0; index < 40; index++) await new Promise<void>((done) => requestAnimationFrame(() => done())); });
        let cameraOffsetX = 0;
        const clickWorld = async (x: number, y: number) => {
          const canvas = (await page.locator(".world-canvas canvas").boundingBox())!;
          await page.mouse.click(canvas.x + canvas.width / 2 + (x - 720) * .78 + cameraOffsetX, canvas.y + canvas.height / 2 + (y - 650) * .78);
        };
        await clickWorld(656, 636);
        await page.getByRole("region", { name: "Selected Leo Martins", exact: true }).waitFor();
        await review.capture(page, `${prefix}-player-actions`);
        await page.setViewportSize({ width: width! - 20, height: height! - 30 });
        await review.capture(page, `${prefix}-player-actions-resized`);
        const menu = (await page.locator(".world-actions.contextual").boundingBox())!;
        const bar = (await page.locator(".top-bar").boundingBox())!;
        const dock = (await page.locator(".control-dock").boundingBox())!;
        assert(menu.y >= bar.y + bar.height && menu.y + menu.height <= dock.y);
        assert(menu.x >= 0 && menu.x + menu.width <= width! - 20);
        assert(dock.x >= 0 && dock.x + dock.width <= width! - 20);
        await page.getByRole("button", { name: "Clear selection", exact: true }).click();
        await page.setViewportSize({ width: width!, height: height! });
        await page.evaluate(async () => { for (let index = 0; index < 24; index++) await new Promise<void>((done) => requestAnimationFrame(() => done())); });
        if (width === 844) {
          const canvas = (await page.locator(".world-canvas canvas").boundingBox())!;
          await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
          await page.mouse.down({ button: "middle" });
          await page.mouse.move(canvas.x + canvas.width / 2 - 120, canvas.y + canvas.height / 2);
          await page.mouse.up({ button: "middle" });
          cameraOffsetX = -120;
        }
        const bounds = getPlacedAssetBounds(layout.objects[0]!);
        await clickWorld(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        await page.getByRole("button", { name: "Ring gong", exact: true }).waitFor();
        await review.capture(page, `${prefix}-gong`);
        await page.getByRole("button", { name: "Ring gong", exact: true }).click();
        await clickWorld(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        await page.getByRole("button", { name: /^Ready in/ }).waitFor();
        await review.capture(page, `${prefix}-gong-cooldown`);
        await page.getByRole("button", { name: "Clear selection", exact: true }).click();
        if (await page.getByRole("button", { name: "Follow", exact: true }).count()) {
          await page.getByRole("button", { name: "Follow", exact: true }).click();
        }
        const room = layout.rooms.find((item) => item.privateEligible)!;
        const door = layout.openings.find((item) => item.type === "door" && room.doorIds.includes(item.id)) as Door;
        room.access = { mode: "assigned", assignedPersonIds: ["user-leo"], knockable: true };
        const outside = getRoomDoorPosition(layout, room, door, "outside");
        fixture.position(outside.x, outside.y);
        fixture.position(outside.x, outside.y, "user-leo");
        layout.revision++;
        fixture.sockets.get("user-maya")!.send(JSON.stringify({ type: "layout.updated", layout }));
        await page.waitForFunction((id) => [...document.querySelectorAll<HTMLOptionElement>('[aria-label="Active interaction"] option')].some((item) => item.value === id)
          || document.querySelector(".door-interaction") !== null, door.id);
        const interaction = page.getByRole("combobox", { name: "Active interaction", exact: true });
        if (await interaction.count()) await interaction.selectOption(door.id);
        await page.getByRole("button", { name: "Knock", exact: true }).waitFor();
        await review.capture(page, `${prefix}-door-knock`);
        fixture.ignoredCommands.add("room.knock");
        await page.getByRole("button", { name: "Knock", exact: true }).click();
        await page.getByRole("button", { name: "Waiting", exact: true }).waitFor();
        await review.capture(page, `${prefix}-door-waiting`);
        room.access.assignedPersonIds.push("user-maya");
        layout.revision++;
        fixture.sockets.get("user-maya")!.send(JSON.stringify({ type: "layout.updated", layout }));
        await page.getByRole("button", { name: "Enter", exact: true }).waitFor();
        await review.capture(page, `${prefix}-door-enter`);
        await page.getByRole("button", { name: "Enter", exact: true }).click();
        assert(fixture.commands.some((command) => command.type === "movement.set_destination"));
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
