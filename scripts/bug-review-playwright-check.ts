import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";
import puppeteer from "puppeteer";
import { DEFAULT_CHARACTER_APPEARANCE, getPlacedAssetInteractions } from "../packages/shared/src/index.js";
import { createReviewFixture } from "./application-review/fixture.js";
import { installWorldProbe, worldReady } from "./characters/playwright-animation.js";

const output = fileURLToPath(new URL("../artifacts/bug-review/browser/", import.meta.url));
const errors: string[] = [];
const verified: string[] = [];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });

async function closeGame(page: Page) {
  for (const name of ["Close game", "Leave game"]) {
    const button = page.getByRole("button", { name, exact: true });
    if (await button.isVisible()) await button.click();
  }
}

async function screenPoint(page: Page, point: { x: number; y: number }) {
  return page.evaluate((position) => {
    const layer = globalThis.findAvatar("You")!.parent!.parent!.parent!;
    const point = layer.toGlobal(position);
    const bounds = document.querySelector(".world-canvas canvas")!.getBoundingClientRect();
    return { x: point.x + bounds.x, y: point.y + bounds.y };
  }, point);
}

try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const fixture = await createReviewFixture();
    const context = await browser.newContext({ viewport });
    await fixture.install(context, "maya");
    fixture.store.updateMemberCharacter("user-maya", { ...DEFAULT_CHARACTER_APPEARANCE });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.on("pageerror", (error) => errors.push(error.message));
    await installWorldProbe(page);
    try {
      const layout = fixture.store.getLayout("floor-studio")!;
      const bounds = { x: 688, y: 416, width: 256, height: 320 };
      const chair = { id: "review-chair", floorId: layout.floorId, assetId: "chair-office", variantId: "white", rotation: 90 as const, x: 704, y: 528 };
      fixture.store.replaceLayout({ ...layout, revision: layout.revision + 1, objects: [chair], openings: [],
        walls: [{ id: "partition", start: { x: 688, y: 416 }, end: { x: 688, y: 736 } }],
        rooms: [{ ...layout.rooms[0]!, id: "private-room", bounds, footprint: [bounds], access: { mode: "assigned", assignedPersonIds: ["user-leo"], knockable: true } }],
      });
      fixture.position(640, 544);
      await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
      await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
      await closeGame(page);
      await worldReady(page);
      const closePeople = page.getByRole("button", { name: "Close people", exact: true });
      if (await closePeople.isVisible()) await closePeople.click();
      const point = await screenPoint(page, getPlacedAssetInteractions(chair)[0]!.center);
      await page.mouse.click(point.x, point.y);
      await page.getByRole("button", { name: "Sit", exact: true }).first().click();
      await page.getByText("That spot is blocked.", { exact: true }).waitFor();
      assert(fixture.events.some((event) => event.type === "command.error" && event.code === "DESTINATION_BLOCKED"));
      assert.equal(fixture.runtime.serializePlayers().find((player) => player.userId === "user-maya")!.x, 640);
      await page.screenshot({ path: `${output}/${viewport.width}-seat-access.png` });
      verified.push(`${viewport.width}: clicking a nearby restricted seat cannot cross the partition`);

      await closeGame(page);
      const current = fixture.store.getLayout(layout.floorId)!;
      fixture.store.replaceLayout({ ...current, revision: current.revision + 1, objects: [], walls: [], rooms: [] });
      fixture.position(720, 650);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
      await worldReady(page);
      await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
      await page.keyboard.down("ArrowRight");
      await page.waitForFunction(() => globalThis.findAvatar("You")!.parent!.parent!.x > 735);
      const observer = await page.evaluateHandle(() => {
        const url = new URL("/v1/realtime?floorId=floor-studio", location.href);
        url.protocol = "ws:";
        const connection = { socket: new WebSocket(url), synced: false };
        connection.socket.addEventListener("message", (message) => {
          if ((JSON.parse(String(message.data)) as { type: string }).type === "session.synced") connection.synced = true;
        });
        return connection;
      });
      try {
        await page.waitForFunction(({ synced }) => synced, observer);
        const before = fixture.runtime.serializePlayers().find((player) => player.userId === "user-maya")!.x;
        await page.waitForFunction((minimum) => globalThis.findAvatar("You")!.parent!.parent!.x > minimum + 15, before)
          .catch((error: unknown) => { throw new Error(`Movement stopped after connecting: ${JSON.stringify({ before, player: fixture.runtime.serializePlayers().find((player) => player.userId === "user-maya"), commands: fixture.commands.filter((command) => command.type === "movement.input") })}`, { cause: error }); });
        await observer.evaluate(({ socket }) => socket.close());
        await page.waitForFunction(({ socket }) => socket.readyState === WebSocket.CLOSED, observer);
        const after = fixture.runtime.serializePlayers().find((player) => player.userId === "user-maya")!.x;
        await page.waitForFunction((minimum) => globalThis.findAvatar("You")!.parent!.parent!.x > minimum + 15, after);
      } finally {
        await page.keyboard.up("ArrowRight");
        await observer.evaluate(({ socket }) => socket.close());
        await observer.dispose();
      }
      verified.push(`${viewport.width}: another connection can open and close while a held movement key keeps working`);

      await closeGame(page);
      await page.route("**/characters/anime/head/female-calm.png", (route) => route.abort("failed"));
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator(".world-artwork-error").waitFor();
      await page.screenshot({ path: `${output}/${viewport.width}-character-load-error.png` });
      await page.unroute("**/characters/anime/head/female-calm.png");
      await page.getByRole("button", { name: "Reload", exact: true }).click();
      await worldReady(page);
      assert.equal(await page.locator(".world-artwork-error").count(), 0);
      await page.screenshot({ path: `${output}/${viewport.width}-character-recovered.png` });
      verified.push(`${viewport.width}: failed world character artwork offers Reload and recovers`);

      await page.evaluate(() => {
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof getContext>) {
          if (this.closest(".character-stage")) return null;
          return getContext.apply(this, args);
        } as typeof getContext;
        (globalThis as typeof globalThis & { restorePreviewCanvas: () => void }).restorePreviewCanvas = () => { HTMLCanvasElement.prototype.getContext = getContext; };
      });
      await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
      await page.locator(".character-preview-error").waitFor();
      assert(await page.getByRole("button", { name: "Use character", exact: true }).isDisabled());
      await page.screenshot({ path: `${output}/${viewport.width}-preview-context-error.png` });
      await page.evaluate(() => (globalThis as typeof globalThis & { restorePreviewCanvas: () => void }).restorePreviewCanvas());
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await page.waitForFunction(() => document.querySelector<HTMLButtonElement>(".character-editor-actions .primary-button")?.disabled === false);
      await page.screenshot({ path: `${output}/${viewport.width}-preview-recovered.png` });
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      verified.push(`${viewport.width}: unavailable preview canvas keeps saving disabled and retries successfully`);
    } finally {
      await context.close();
      await fixture.stop();
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify({ verified, errors }, null, 2));
}
