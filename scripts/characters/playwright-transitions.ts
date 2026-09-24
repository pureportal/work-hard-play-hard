import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";
import puppeteer from "puppeteer";
import { CHARACTER_CANVAS_SIZE, CHARACTER_DIRECTIONS, CHARACTER_FOOT_ANCHOR, CHARACTER_SEAT_ANCHOR, CHARACTER_WORLD_SIZE, DEFAULT_CHARACTER_APPEARANCE, getPlacedAssetInteractions, type ServerEvent, type WorldPlayer } from "../../packages/shared/src/index.js";
import { createReviewFixture } from "../application-review/fixture.js";
import { installWorldProbe, verifyWorldMovement, worldReady } from "./playwright-animation.js";

const output = fileURLToPath(new URL("../../artifacts/characters/state-review/after/transitions/", import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const inspected: string[] = [];
const errors: string[] = [];

async function settled(page: Page, x: number, y: number) {
  await page.waitForFunction(({ x, y }) => {
    const player = globalThis.findAvatar("You")!.parent!.parent!;
    return Math.hypot(player.x - x, player.y - y) < 0.1;
  }, { x, y });
}

async function samples(page: Page) {
  return page.evaluate(async () => {
    const result = [];
    const started = performance.now();
    while (performance.now() - started < 700) {
      const sprite = globalThis.findAvatar("You")!;
      const player = sprite.parent!.parent!;
      result.push({ x: player.x, y: player.y, frameY: sprite.texture!.frame.y, frameX: sprite.texture!.frame.x, anchorY: sprite.anchor!.y });
      await new Promise(requestAnimationFrame);
    }
    return result;
  });
}

try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const fixture = await createReviewFixture();
    const layout = fixture.store.getLayout("floor-studio")!;
    const seat = { id: "transition-seat", floorId: layout.floorId, assetId: "chair-office", variantId: "white", rotation: 0 as const, x: 688, y: 528 };
    layout.objects = [seat];
    layout.revision++;
    fixture.store.updateMemberCharacter("user-maya", { ...DEFAULT_CHARACTER_APPEARANCE });
    fixture.position(720, 650);
    const context = await browser.newContext({ viewport });
    await fixture.install(context, "maya");
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.on("pageerror", (error) => errors.push(error.message));
    await installWorldProbe(page);
    try {
      await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
      await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
      await worldReady(page);
      const closePeople = page.getByRole("button", { name: "Close people", exact: true });
      if (await closePeople.isVisible()) await closePeople.click();
      await verifyWorldMovement(page);
      const players = fixture.runtime.serializePlayers().filter((player) => player.floorId === layout.floorId);
      fixture.runtime.stop();
      const emit = (event: ServerEvent) => fixture.sockets.get("user-maya")!.send(JSON.stringify(event));
      const snapshot = (updated: WorldPlayer[]) => emit({ type: "world.snapshot", tick: Date.now(), floorId: layout.floorId, layoutRevision: layout.revision, players: updated });
      const initial = players.map((player) => player.userId === "user-maya" ? { ...player, x: 720, y: 650, facing: "down" as const } : player);
      snapshot(initial);
      await settled(page, 720, 650);
      await page.evaluate(() => { globalThis.findAvatar("You")!.parent!.parent!.label = "retained-player-view"; });
      for (const reaction of ["wave", "heart", "celebrate", "clap"] as const) {
        emit({ type: "interaction.reaction", id: `character-${reaction}`, userId: "user-maya", reaction, scope: { type: "floor", floorId: layout.floorId } });
        await samples(page);
        await page.screenshot({ path: `${output}/${viewport.width}-${reaction}.png` });
      }
      snapshot(initial.map((player) => player.userId === "user-maya" ? { ...player, wavingUntil: Date.now() + 2500 } : player));
      await samples(page);
      await page.screenshot({ path: `${output}/${viewport.width}-waving.png` });
      emit({ type: "interaction.group_reaction", id: "character-high-five", kind: "high_five", userIds: ["user-maya", "user-elena"], floorId: layout.floorId });
      await samples(page);
      await page.screenshot({ path: `${output}/${viewport.width}-high-five.png` });
      const carried = initial.map((player) => player.userId === "user-maya" ? { ...player, carriedByUserId: "user-elena" }
        : player.userId === "user-elena" ? { ...player, x: 740, y: 650, facing: "down" as const } : player);
      snapshot(carried);
      await page.locator(".kidnapping-status").waitFor();
      const carriedY = 650 - CHARACTER_WORLD_SIZE * 0.7;
      await settled(page, 740, carriedY);
      await page.waitForTimeout(1800);
      const carriedFrames = await samples(page);
      assert(carriedFrames.every((frame) => frame.frameY === 0 && frame.frameX >= CHARACTER_CANVAS_SIZE * 4 && frame.anchorY === CHARACTER_SEAT_ANCHOR.y / CHARACTER_CANVAS_SIZE));
      await page.screenshot({ path: `${output}/${viewport.width}-carried.png` });
      for (const [index, direction] of CHARACTER_DIRECTIONS.entries()) {
        const x = 760 + index * 20;
        snapshot(carried.map((player) => player.userId === "user-elena" ? { ...player, x, facing: direction } : player));
        await settled(page, x, carriedY);
        assert((await samples(page)).every((frame) => frame.frameY === index * CHARACTER_CANVAS_SIZE && frame.frameX >= CHARACTER_CANVAS_SIZE * 4));
        await page.screenshot({ path: `${output}/${viewport.width}-carried-${direction}.png` });
        const center = await page.evaluate(() => {
          const point = globalThis.findAvatar("You")!.parent!.parent!.toGlobal({ x: 0, y: 0 });
          const canvas = document.querySelector(".world-canvas canvas")!.getBoundingClientRect();
          return { x: point.x + canvas.x, y: point.y + canvas.y };
        });
        await page.screenshot({ path: `${output}/${viewport.width}-carried-${direction}-detail.png`, clip: { x: Math.round(center.x) - 60, y: Math.round(center.y) - 60, width: 120, height: 150 } });
      }
      snapshot(initial);
      await settled(page, 720, 650);
      assert((await samples(page)).every((frame) => frame.anchorY === CHARACTER_FOOT_ANCHOR.y / CHARACTER_CANVAS_SIZE));
      await page.screenshot({ path: `${output}/${viewport.width}-put-down.png` });
      const interaction = getPlacedAssetInteractions(seat)[0]!;
      snapshot(initial.map((player) => player.userId === "user-maya" ? { ...player, ...interaction.center, facing: interaction.direction, seat: { objectId: seat.id, interactionId: interaction.id } } : player));
      await settled(page, interaction.center.x, interaction.center.y);
      await page.evaluate(() => { globalThis.findAvatar("You")!.label = "original-appearance"; });
      await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
      await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>(".character-editor-actions .primary-button")?.disabled);
      await page.getByRole("tab", { name: "Hair", exact: true }).click();
      await page.getByRole("button", { name: "Midnight spikes", exact: true }).click();
      await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>(".character-editor-actions .primary-button")?.disabled);
      await page.getByRole("button", { name: "Use character", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page.waitForFunction(() => globalThis.findAvatar("You")?.label !== "original-appearance");
      await page.waitForFunction((anchor) => globalThis.findAvatar("You")!.anchor!.y === anchor, CHARACTER_SEAT_ANCHOR.y / CHARACTER_CANVAS_SIZE);
      assert.equal(await page.evaluate(() => globalThis.findAvatar("You")!.parent!.parent!.label), "retained-player-view");
      assert.equal(fixture.store.getMember("user-maya")!.character.hairstyle, "spiky");
      await page.screenshot({ path: `${output}/${viewport.width}-appearance-while-seated.png` });
      snapshot(initial);
      await settled(page, 720, 650);
      inspected.push(`${viewport.width}x${viewport.height}: four-direction movement and stopping through the runtime; reactions, wave and high-five effects, seated carry pose following all four carrier directions, put-down, and saving a new appearance while seated using injected state snapshots`);
    } finally {
      await context.close();
      await fixture.stop();
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify({ inspected, errors }, null, 2));
}
