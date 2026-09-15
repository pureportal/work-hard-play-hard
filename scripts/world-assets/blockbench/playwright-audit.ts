import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import type { Application, Sprite } from "../../../apps/client/node_modules/pixi.js";
import {
  ASSET_CATALOG, ASSET_ROTATIONS, getPlacedAssetCells,
  getDefaultAssetVariantId, requireAssetDefinition, type Position, type WorldObject,
} from "../../../packages/shared/src/index.js";
import { installAssetFixture } from "../playwright-fixture.js";
import { installWorldProbe } from "../../characters/playwright-animation.js";

const output = process.argv.find(argument => argument.startsWith("--output="))?.slice(9) ?? "../../artifacts/blockbench-audit";
const requested = process.argv.find(argument => argument.startsWith("--asset="))?.slice(8).split(",");
const catalogAssets = requested ? requested.map(requireAssetDefinition) : ASSET_CATALOG.assets;
const catalogOnly = process.argv.includes("--catalog");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const fixture = await installAssetFixture(context, "user-maya", { x: 704, y: 576 });
const layout = fixture.store.getLayout("floor-studio")!;
layout.walls = [];
layout.openings = [];
layout.rooms = [];
layout.tiles = [];
layout.objects = [];
layout.revision++;
const page = await context.newPage();
page.setDefaultTimeout(15_000);
const errors: string[] = [];
const architectureOnly = process.argv.includes("--architecture");
const decorationsOnly = process.argv.includes("--decorations");
const checked: unknown[] = architectureOnly ? JSON.parse(await readFile(`${output}/browser-report.json`, "utf8")).checked.filter((check: Record<string, unknown>) => !("architecture" in check) && !("architectureReload" in check))
  : decorationsOnly ? JSON.parse(await readFile(`${output}/browser-report.json`, "utf8")).checked.filter((check: Record<string, unknown>) => !("decorationRotation" in check))
  : process.argv.includes("--interactions") ? JSON.parse(await readFile(`${output}/browser-report.json`, "utf8")).checked.filter((check: Record<string, unknown>) => "inGameCatalog" in check || "architecture" in check || "architectureReload" in check) : [];
page.on("pageerror", error => errors.push(error.message));
page.on("response", response => {
  if (/\/(world-assets|world-architecture|characters)\//.test(response.url()) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
});
await installWorldProbe(page);

function object(assetId: string, x: number, y: number, rotation = 0, id = assetId): WorldObject {
  return { id, assetId, x, y, rotation: rotation as WorldObject["rotation"], floorId: layout.floorId, variantId: getDefaultAssetVariantId(requireAssetDefinition(assetId)) };
}

async function publish() {
  layout.revision++;
  fixture.publish({ type: "layout.updated", layout });
  await page.waitForFunction(async expected => {
    const artwork = await import("/src/world-asset-artwork.json?import" as string);
    const app = globalThis.avatarWorld as unknown as Application;
    if (!app) return false;
    for (const object of expected) {
      const node = app.stage.getChildByLabel(`world-asset:${object.id}`, true);
      const sprites = node?.getChildByLabel("artwork")?.children.filter((child): child is Sprite => child.label.startsWith("/world-assets/"));
      if (!sprites?.length || !sprites.every(sprite => sprite.visible)) return false;
      const frames = artwork.default[object.assetId].variants[object.variantId].frames.filter((_frame: unknown, index: number) => index % 4 === object.rotation / 90);
      if (!frames.some((frame: { x: number; y: number }) => sprites.at(-1)?.texture?.frame.x === frame.x && sprites.at(-1)?.texture?.frame.y === frame.y)) return false;
    }
    return true;
  }, layout.objects);
}

async function screenPoint(point: Position) {
  await page.waitForFunction(() => Boolean(globalThis.avatarWorld?.stage.children?.length));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.evaluate(point => {
    const app = globalThis.avatarWorld as unknown as Application;
    const screen = app.stage.children[0]!.toGlobal(point);
    const canvas = app.canvas.getBoundingClientRect();
    return { x: screen.x * canvas.width / app.screen.width + canvas.x, y: screen.y * canvas.height / app.screen.height + canvas.y };
  }, point);
}

async function clickPoint(point: Position) {
  const screen = await screenPoint(point);
  await page.mouse.click(screen.x, screen.y);
}

async function waitForPlayer(condition: (position: Position) => boolean) {
  const deadline = Date.now() + 8_000;
  while (!condition(fixture.getPlayer("user-maya")!)) {
    assert(Date.now() < deadline, `Movement did not reach expected position: ${JSON.stringify(fixture.getPlayer("user-maya"))}`);
    await page.waitForTimeout(50);
  }
}

async function moveTo(point: Position) {
  const commandIndex = fixture.commands.length;
  await clickPoint(point);
  await page.waitForTimeout(100);
  const destination = fixture.commands.slice(commandIndex).find(command => command.type === "movement.set_destination");
  assert(destination, "Clicking open ground must request a destination");
  assert(Math.hypot(destination.x - point.x, destination.y - point.y) < 16, `Destination ${destination.x},${destination.y} differs from requested point ${point.x},${point.y}`);
  await waitForPlayer(position => Math.hypot(position.x - destination.x, position.y - destination.y) < 2);
  await page.waitForTimeout(150);
}

async function hold(key: string, duration: number) {
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.keyboard.down(key);
  try { await page.waitForTimeout(duration); } finally { await page.keyboard.up(key); }
}

async function chooseAsset(assetId: string) {
  const asset = requireAssetDefinition(assetId);
  await page.getByRole("tab", { name: ASSET_CATALOG.categories.find(category => category.id === asset.category)!.name, exact: true }).click();
  await page.getByRole("button", { name: asset.name, exact: true }).click();
}

async function artworkPoint(id: string) {
  await page.waitForFunction(id => (globalThis.avatarWorld as unknown as Application)?.stage.getChildByLabel(`world-asset:${id}`, true)?.getChildByLabel("artwork")?.children.at(-1)?.visible, id);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.evaluate(id => {
    const app = globalThis.avatarWorld as unknown as Application;
    const sprite = app.stage.getChildByLabel(`world-asset:${id}`, true)!.getChildByLabel("artwork")!.children.at(-1) as Sprite;
    const frame = sprite.texture.frame;
    const canvas = document.createElement("canvas");
    canvas.width = frame.width;
    canvas.height = frame.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(sprite.texture.source.resource as HTMLImageElement, frame.x, frame.y, frame.width, frame.height, 0, 0, frame.width, frame.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let hit = { x: 0, y: 0, distance: Infinity };
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3]! < 200) continue;
      const distance = (x - canvas.width / 2) ** 2 + (y - canvas.height * 0.75) ** 2;
      if (distance < hit.distance) hit = { x, y, distance };
    }
    const bounds = sprite.getBounds();
    const screen = app.canvas.getBoundingClientRect();
    return { x: screen.x + (bounds.x + (hit.x + 0.5) / canvas.width * bounds.width) * screen.width / app.screen.width, y: screen.y + (bounds.y + (hit.y + 0.5) / canvas.height * bounds.height) * screen.height / app.screen.height };
  }, id);
}

try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  const closePeople = page.getByRole("button", { name: "Close people", exact: true });
  if (await closePeople.isVisible()) await closePeople.click();

  if (architectureOnly) {
    for (const vertical of [false, true]) {
      const position = (along: number, across: number) => vertical ? { x: 960 + across, y: 256 + along } : { x: 448 + along, y: 416 + across };
      const normal = () => vertical ? fixture.getPlayer("user-maya")!.x - 960 : fixture.getPlayer("user-maya")!.y - 416;
      layout.walls = [];
      await publish();
      await moveTo(position(64, 64));
      layout.walls = [{ id: "review-wall", start: position(0, 0), end: position(640, 0) }];
      layout.openings = [
        { id: "review-door", wallId: "review-wall", type: "door", offset: 192, width: 64 },
        { id: "review-window", wallId: "review-wall", type: "window", offset: 352, width: 96, light: { color: "#fff4dc", intensity: 0.2, depth: 100 } },
      ];
      await publish();
      await hold(vertical ? "ArrowLeft" : "ArrowUp", 900);
      assert(normal() >= 18 && normal() < 50, "The textured wall must block movement");
      await moveTo(position(224, 64));
      await hold(vertical ? "ArrowLeft" : "ArrowUp", 1100);
      assert(normal() < -16, "The open threshold must remain walkable");
      await moveTo(position(400, -64));
      await hold(vertical ? "ArrowRight" : "ArrowDown", 900);
      assert(normal() <= -18 && normal() > -50, "The window must retain wall collision");
      await page.screenshot({ path: `${output}/architecture-${vertical ? "vertical" : "horizontal"}.png` });
      await page.getByRole("button", { name: "Build", exact: true }).click();
      await page.getByRole("button", { name: "Select", exact: true }).click();
      await clickPoint(position(400, 0));
      await page.getByRole("region", { name: "Selected Window", exact: true }).waitFor();
      await clickPoint(position(224, 0));
      await page.getByRole("region", { name: "Selected Door", exact: true }).waitFor();
      await clickPoint(position(64, 0));
      await page.getByRole("region", { name: "Selected Wall", exact: true }).waitFor();
      await page.getByRole("button", { name: "Use dark mode", exact: true }).click();
      await page.screenshot({ path: `${output}/architecture-${vertical ? "vertical" : "horizontal"}-dark.png` });
      await page.getByRole("button", { name: "Use light mode", exact: true }).click();
      await page.getByRole("button", { name: "Close build tools", exact: true }).click();
      checked.push({ architecture: vertical ? "vertical" : "horizontal", wallBlocked: true, windowBlocked: true, doorTraversed: true, selection: true, themes: ["light", "dark"] });
      console.log(`Architecture verified: ${vertical ? "vertical" : "horizontal"}`);
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
    await publish();
    checked.push({ architectureReload: true });
  } else {
    if (!process.argv.includes("--interactions") && !decorationsOnly) {
      for (let start = 0; start < catalogAssets.length; start += 9) {
        for (const rotation of ASSET_ROTATIONS) {
          layout.objects = catalogAssets.slice(start, start + 9).flatMap((asset, index) => {
            const placed = object(asset.id, 256 + index % 3 * 320, 320 + Math.floor(index / 3) * 240, rotation);
            placed.label = asset.name;
            if (asset.placement.layer !== "surface") return [placed];
            const table = object("table-workbench", placed.x - 32, placed.y, 0, `support-${asset.id}`);
            return [table, placed];
          });
          await publish();
          await page.screenshot({ path: `${output}/world-catalog-${start / 9 + 1}-${rotation}.png` });
        }
        console.log(`In-game review: ${Math.min(start + 9, catalogAssets.length)}/${catalogAssets.length} assets, four rotations`);
      }
      checked.push({ inGameCatalog: catalogAssets.length, directionalViews: catalogAssets.length * 4 });
    }

    if (!decorationsOnly && !catalogOnly) {
      layout.objects = [object("desk-corner", 480, 384), object("light-arc", 784, 448), object("storage-cubby", 976, 400)];
      await publish();
      for (const rotation of ASSET_ROTATIONS) {
        for (const placed of layout.objects) placed.rotation = rotation;
        await publish();
        const desk = layout.objects[0]!;
        const occupied = getPlacedAssetCells(desk);
        const holes: Position[] = [];
        for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
          if (!occupied.some(cell => cell.x === x && cell.y === y)) holes.push({ x: desk.x + x * 16 + 8, y: desk.y + y * 16 + 8 });
        }
        const corner = { x: holes.reduce((sum, point) => sum + point.x, 0) / holes.length, y: holes.reduce((sum, point) => sum + point.y, 0) / holes.length };
        await moveTo(corner);
        checked.push({ cornerDeskRotation: rotation, reachedOpenCorner: { x: fixture.getPlayer("user-maya")!.x, y: fixture.getPlayer("user-maya")!.y } });
        await page.screenshot({ path: `${output}/corner-collision-${rotation}.png` });
        await moveTo({ x: 704, y: 640 });
        const lamp = layout.objects[1]!;
        const cells = getPlacedAssetCells(lamp);
        const center = (solid: boolean) => {
          const selected = cells.filter(cell => cell.solid === solid);
          return { x: selected.reduce((sum, cell) => sum + cell.worldX + 8, 0) / selected.length, y: selected.reduce((sum, cell) => sum + cell.worldY + 8, 0) / selected.length };
        };
        const canopy = center(false);
        const base = center(true);
        await moveTo(canopy);
        const key = base.x !== canopy.x ? base.x > canopy.x ? "ArrowRight" : "ArrowLeft" : base.y > canopy.y ? "ArrowDown" : "ArrowUp";
        await hold(key, 750);
        const stopped = fixture.getPlayer("user-maya")!;
        assert(Math.hypot(stopped.x - base.x, stopped.y - base.y) >= 24, "Lamp base must block the player");
        checked.push({ lampRotation: rotation, canopyWalkable: true, baseBlocked: true, stopped });
        await moveTo({ x: 704, y: 640 });
      }
    }

    if (!catalogOnly) {
      layout.objects = [object("desk-executive", 480, 416)];
      await publish();
      await page.getByRole("button", { name: "Build", exact: true }).click();
      await chooseAsset("decor-laptop");
      for (const rotation of ASSET_ROTATIONS) {
        const rotate = page.getByRole("button", { name: /Rotate asset clockwise, currently facing/ });
        while (await rotate.getAttribute("aria-label") !== `Rotate asset clockwise, currently facing ${["South", "West", "North", "East"][rotation / 90]}`) await rotate.click();
        const point = await screenPoint({ x: 544, y: 423 });
        await page.mouse.move(point.x, point.y);
        await page.waitForFunction(() => document.querySelector(".placement-confirm")?.matches(":enabled"));
        await page.screenshot({ path: `${output}/supported-preview-${rotation}.png` });
        const before = fixture.store.getLayout(layout.floorId)!.objects.length;
        await page.mouse.click(point.x, point.y);
        await page.waitForFunction(() => document.querySelector(".placement-confirm")?.matches(":disabled"));
        const placed = fixture.store.getLayout(layout.floorId)!.objects.at(-1)!;
        assert.equal(fixture.store.getLayout(layout.floorId)!.objects.length, before + 1);
        assert.equal(placed.assetId, "decor-laptop");
        assert.equal(placed.rotation, rotation);
        await page.mouse.click(point.x, point.y);
        assert.equal(fixture.store.getLayout(layout.floorId)!.objects.length, before + 1);
        await page.getByRole("button", { name: "Select", exact: true }).click();
        const visible = await artworkPoint(placed.id);
        await page.mouse.click(visible.x, visible.y);
        await page.getByRole("region", { name: "Selected Laptop", exact: true }).waitFor();
        await page.screenshot({ path: `${output}/supported-selected-${rotation}.png` });
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
        assert(fixture.store.getLayout(layout.floorId)!.objects.some(object => object.id === placed.id && object.rotation === rotation));
        await page.getByRole("button", { name: "Build", exact: true }).click();
        await page.getByRole("button", { name: "Select", exact: true }).click();
        const reloadedPoint = await artworkPoint(placed.id);
        await page.mouse.click(reloadedPoint.x, reloadedPoint.y);
        await page.getByRole("region", { name: "Selected Laptop", exact: true }).waitFor();
        await page.getByRole("button", { name: "Erase", exact: true }).click();
        await page.mouse.click(reloadedPoint.x, reloadedPoint.y);
        await page.locator(".build-selection").waitFor({ state: "hidden" });
        await page.waitForTimeout(100);
        assert(!fixture.store.getLayout(layout.floorId)!.objects.some(object => object.id === placed.id), "Removal must reach the runtime");
        assert(fixture.store.getLayout(layout.floorId)!.objects.some(object => object.assetId === "desk-executive"), "Erasing raised artwork must preserve its support");
        checked.push({ decorationRotation: rotation, placed: true, selectedArtwork: true, overlapRejected: true, reloaded: true, erasedArtwork: true, supportPreserved: true });
        await chooseAsset("decor-laptop");
      }
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await page.screenshot({ path: `${output}/audit-last.png` }).catch(error => console.error("Could not capture the last audit frame", error));
  await writeFile(`${output}/browser-report.json`, JSON.stringify({ checked, errors }, null, 2));
  fixture.stop();
  await browser.close();
}
