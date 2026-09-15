import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { MikroORM } from "@mikro-orm/postgresql";
import type { Page } from "playwright-core";
import { getAssetPlacementError, getPlacedAssetBounds, type WhiteboardDocument, type WorldObject } from "@workhard/shared";
import { createDatabaseConfig } from "../src/persistence/database-config.js";
import { bootstrap, command, launchWhiteboardBrowser, openBoard, playerSession, saved } from "../../../scripts/whiteboard-live-session.js";

const output = resolve("../../artifacts/whiteboard-polish");
await mkdir(output, { recursive: true });
const browser = await launchWhiteboardBrowser();
const orm = await MikroORM.init(createDatabaseConfig());
const em = orm.em.fork();
const checks: string[] = [];
const errors: string[] = [];
const boards: WorldObject[] = [];
let admin: Page | undefined;
let active: Page | undefined;

async function createBoard(x: number) {
  const data = await bootstrap(admin!);
  const layout = data.layouts.find((layout) => layout.floorId === "floor-studio")!;
  const floor = data.floors.find((floor) => floor.id === layout.floorId)!;
  const positions = [784, 848, 720, 688].flatMap((y) => [x, 288, 448, 576, 672, 800].map((x) => ({ x, y })));
  const players = await admin!.evaluate(() => globalThis.whiteboardReview.events.filter((event) => event.type === "world.snapshot").at(-1)?.players ?? []);
  const position = positions.find((position) => {
    const candidate: WorldObject = { id: "review-placement", floorId: layout.floorId, assetId: "equipment-whiteboard", rotation: 0, ...position };
    const bounds = getPlacedAssetBounds(candidate);
    return !getAssetPlacementError(layout, floor, candidate) && !players.some((player) => player.connected && player.floorId === layout.floorId
      && Math.hypot(player.x - Math.max(bounds.x, Math.min(player.x, bounds.x + bounds.width)), player.y - Math.max(bounds.y, Math.min(player.y, bounds.y + bounds.height))) < 40);
  });
  assert(position, "A free whiteboard position in Product Studio");
  await command(admin!, { type: "layout.apply", requestId: crypto.randomUUID(), baseRevision: layout.revision,
    edit: { tool: "asset", assetId: "equipment-whiteboard", variantId: "violet", rotation: 0, position } });
  const next = (await bootstrap(admin!)).layouts.find((candidate) => candidate.floorId === layout.floorId)!;
  const board = next.objects.find((object) => !layout.objects.some((before) => before.id === object.id));
  assert(board, "Created a dedicated review whiteboard");
  boards.push(board);
  await writeFile(resolve(output, "fixture.json"), JSON.stringify(boards.map((board) => ({ id: board.id, floorId: board.floorId })), null, 2));
  console.log(`Created review board ${board.id}`);
  return board;
}

async function savedDocument(page: Page, board = boards[0]!): Promise<WhiteboardDocument> {
  const object = (await bootstrap(page)).layouts.flatMap((layout) => layout.objects).find((object) => object.id === board.id);
  assert(object?.workState?.kind === "whiteboard");
  return object.workState.document;
}

async function capture(page: Page, name: string) {
  await page.screenshot({ path: resolve(output, `${name}.png`), animations: "disabled" });
  const viewport = page.viewportSize()!;
  const bounds = await page.getByRole("dialog").boundingBox();
  assert(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, "Dialog fits viewport");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal page overflow");
  const save = await page.getByRole("button", { name: "Save", exact: true }).boundingBox();
  assert(save && save.y + save.height <= viewport.height, "Save is visible");
}

async function note(page: Page, title: string, text: string, color: string) {
  await page.getByRole("button", { name: "Sticky note", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Card notes", { exact: true }).fill(text);
  await page.getByRole("button", { name: color, exact: true }).click();
  await page.getByRole("button", { name: "Close card editor" }).click();
  await saved(page);
}

async function drag(page: Page, name: string, dx: number, dy: number, touch = false) {
  const handle = page.getByRole("button", { name, exact: true });
  await handle.scrollIntoViewIfNeeded();
  const bounds = await handle.boundingBox();
  assert(bounds);
  const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
  if (touch) {
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let step = 1; step <= 8; step++) await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx * step / 8, y: y + dy * step / 8 }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await session.detach();
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 8 });
    await page.mouse.up();
  }
  await saved(page);
}

async function removeBoard(board: Pick<WorldObject, "id" | "floorId">) {
  const layout = (await bootstrap(admin!)).layouts.find((layout) => layout.floorId === board.floorId)!;
  if (!layout.objects.some((object) => object.id === board.id)) return;
  await command(admin!, { type: "layout.apply", requestId: crypto.randomUUID(), baseRevision: layout.revision, edit: { tool: "item.remove", item: { type: "asset", id: board.id } } });
}

try {
  admin = await playerSession(browser, "maya");
  console.log("Admin connected");
  const previous = await readFile(resolve(output, "fixture.json"), "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "[]";
    throw error;
  });
  for (const board of JSON.parse(previous) as Pick<WorldObject, "id" | "floorId">[]) await removeBoard(board);
  const board = await createBoard(384);
  await createBoard(672);
  const page = active = await playerSession(browser, "leo");
  console.log("Leo connected");
  page.on("pageerror", (error) => errors.push(error.message));
  await openBoard(page, board);
  console.log("Canvas open");
  await capture(page, "desktop-empty");
  await note(page, "Tiny wins", "Make the first five minutes feel effortless.", "Yellow");
  await note(page, "Friday demo", "Show the new flow. Leave time to play.", "Lavender");
  await note(page, "Cake logistics", "Chocolate or lemon? A serious team decision.", "Pink");
  const before = (await savedDocument(page)).cards[0]!;
  await drag(page, "Move Tiny wins", 60, 60);
  await drag(page, "Resize Tiny wins", 30, 30);
  const moved = (await savedDocument(page)).cards[0]!;
  assert.deepEqual([moved.x - before.x, moved.y - before.y, moved.width - before.width, moved.height - before.height], [80, 80, 40, 40]);
  checks.push("Sticky notes: placement, text, colors, mouse movement and resize, automatic PostgreSQL saves.");

  await page.getByRole("button", { name: "Funny notes", exact: true }).click();
  await capture(page, "desktop-funny-notes");
  await page.getByRole("button", { name: /Ask the duck/ }).click();
  await page.getByRole("button", { name: "Close card editor" }).click();
  await saved(page);

  const width = 720 + Math.floor(Math.random() * 200);
  const image = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="400"><rect width="100%" height="400" fill="#e8e1fb"/><rect x="60" y="60" width="260" height="280" rx="20" fill="white"/><rect x="355" y="60" width="305" height="110" rx="20" fill="#f8ccda"/><rect x="355" y="200" width="140" height="140" rx="20" fill="#c0e4d0"/><circle cx="585" cy="270" r="70" fill="#a896dc"/></svg>`)).png().toBuffer();
  await page.getByRole("button", { name: "Image", exact: true }).click();
  await page.getByLabel("Upload image", { exact: true }).setInputFiles({ name: "moodboard.png", mimeType: "image/png", buffer: image });
  await page.getByLabel("Title", { exact: true }).fill("Look & feel");
  await page.getByRole("button", { name: "Mint", exact: true }).click();
  await page.getByRole("button", { name: "Close card editor" }).click();
  await saved(page);
  await drag(page, "Move Look & feel", 30, 30);
  await drag(page, "Resize Look & feel", 30, 15);
  const uploaded = (await savedDocument(page)).cards.find((card) => card.kind === "image")!;
  assert(uploaded.kind === "image");
  assert.deepEqual([uploaded.color, uploaded.width, uploaded.height], ["mint", 280, 280]);
  const imageId = uploaded.src.split("/").at(-1)!;
  const rows = await em.execute<{ bytes: number; type: string; width: number; height: number }[]>("select octet_length(image) as bytes, pg_typeof(image)::text as type, width, height from whiteboard_images where id = ?", [imageId]);
  assert.equal(rows[0]?.type, "bytea");
  assert(rows[0]!.bytes > 0 && rows[0]!.width === width && rows[0]!.height === 400);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
  await openBoard(page, board);
  await page.getByRole("button", { name: "Fit canvas" }).click();
  await page.locator('.canvas-card img').waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('.canvas-card img')].every((image) => image.complete && image.naturalWidth > 0));
  await capture(page, "desktop-canvas");
  checks.push("Custom PNG upload: PostgreSQL BYTEA, correct dimensions, image color/move/resize, reload persistence and proportion-preserving rendering.");

  await page.getByRole("button", { name: "Board", exact: true }).click();
  await page.getByRole("button", { name: "Edit Friday demo", exact: true }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("doing");
  await page.getByLabel("Due date").fill("2026-10-02");
  await page.getByRole("button", { name: "Close card editor" }).click();
  await saved(page);
  await capture(page, "desktop-board");
  await page.getByRole("button", { name: "Edit Cake logistics", exact: true }).click();
  await page.getByRole("button", { name: "Delete card" }).click();
  await saved(page);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Edit Cake logistics", exact: true }).waitFor();
  await saved(page);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await saved(page);
  assert(!(await savedDocument(page)).cards.some((card) => card.title === "Cake logistics"));
  checks.push("Task board: status, due date, removal, undo and redo after automatic saves.");

  const second = await playerSession(browser, "jonas");
  second.on("pageerror", (error) => errors.push(error.message));
  await openBoard(second, board);
  await second.getByRole("button", { name: "Board", exact: true }).click();
  await Promise.all([note(page, "Leo's idea", "Build a tiny prototype.", "Blue"), note(second, "Jonas's idea", "Test it together.", "Mint")]);
  await page.getByRole("button", { name: "Edit Jonas's idea", exact: true }).waitFor();
  await second.getByRole("button", { name: "Edit Leo's idea", exact: true }).waitFor();
  assert((await savedDocument(page)).cards.some((card) => card.title === "Leo's idea"));
  assert((await savedDocument(page)).cards.some((card) => card.title === "Jonas's idea"));
  await Promise.all([page, second].map((player) => player.getByRole("button", { name: "Edit Tiny wins", exact: true }).click()));
  await Promise.all([page.getByLabel("Card notes", { exact: true }).fill("Leo writes the plan."), second.getByRole("button", { name: "Blue", exact: true }).click()]);
  await Promise.all([saved(page), saved(second)]);
  assert((await savedDocument(page)).cards.some((card) => card.title === "Tiny wins" && card.text === "Leo writes the plan." && card.color === "blue"));
  checks.push("Two real players: simultaneous additions and edits to different fields converge without overwrites.");

  await Promise.all([page.getByLabel("Card notes", { exact: true }).fill("Leo's version"), second.getByLabel("Card notes", { exact: true }).fill("Jonas's version")]);
  const conflicted = await Promise.race([page, second].map(async (player) => { await player.getByText("Choose which changes to keep.", { exact: true }).waitFor(); return player; }));
  await capture(conflicted, "desktop-conflict");
  await conflicted.getByRole("button", { name: "Keep mine", exact: true }).click();
  await saved(conflicted);
  await Promise.all([page, second].map((player) => player.getByRole("button", { name: "Close card editor" }).click()));
  await Promise.all([page, second].map((player) => player.getByRole("button", { name: "Notes", exact: true }).click()));
  await page.getByRole("textbox", { name: "Notes", exact: true }).fill("Friday demo\n\nKeep it short. Leave time to play.");
  await saved(page);
  await second.waitForFunction(() => document.querySelector<HTMLTextAreaElement>('[aria-label="Notes"]')?.value.includes("Friday demo"));
  await capture(page, "desktop-notes");
  checks.push("Same-field conflict shows both versions and explicit resolution. Notes synchronize live.");

  await Promise.all([page, second].map((player) => player.getByRole("button", { name: "Canvas", exact: true }).click()));
  await Promise.all([page.getByRole("button", { name: "Move Tiny wins", exact: true }).press("ArrowRight"), second.getByRole("button", { name: "Move Tiny wins", exact: true }).press("ArrowDown")]);
  const positionConflict = await Promise.race([page, second].map(async (player) => { await player.getByText("Choose which changes to keep.", { exact: true }).waitFor(); return player; }));
  assert.equal(await positionConflict.locator(".whiteboard-conflict-position").count(), 2);
  await capture(positionConflict, "desktop-position-conflict");
  await positionConflict.getByRole("button", { name: "Use theirs", exact: true }).click();
  await saved(positionConflict);
  await second.context().close();
  checks.push("Competing movement shows visual position previews; Use theirs resolves the conflict. Keyboard movement is saved.");

  await page.getByRole("button", { name: "Board", exact: true }).click();
  await page.getByRole("button", { name: "Edit Look & feel", exact: true }).click();
  await page.getByRole("button", { name: "Duplicate card" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Shared image copy");
  await page.getByRole("button", { name: "Delete card" }).click();
  await saved(page);
  assert.equal((await em.execute<{ count: string }[]>("select count(*) from whiteboard_images where id = ?", [imageId]))[0]!.count, "1");
  await page.getByRole("button", { name: "Edit Look & feel", exact: true }).click();
  await page.getByRole("button", { name: "Delete card" }).click();
  await saved(page);
  assert((await em.execute<{ expires_at: Date | null }[]>("select expires_at from whiteboard_image_references where image_id = ? and object_id = ?", [imageId, board.id]))[0]!.expires_at);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await saved(page);
  assert.equal((await em.execute<{ expires_at: Date | null }[]>("select expires_at from whiteboard_image_references where image_id = ? and object_id = ?", [imageId, board.id]))[0]!.expires_at, null);
  checks.push("Image duplicates share one database blob; removal retains undo recovery; undo reattaches the image.");

  await page.getByRole("button", { name: "Close board", exact: true }).click();
  await openBoard(page, boards[1]!);
  await page.getByRole("button", { name: "Image", exact: true }).click();
  await page.getByLabel("Upload image", { exact: true }).setInputFiles({ name: "same-image.png", mimeType: "image/png", buffer: image });
  await page.getByRole("button", { name: "Close card editor" }).click();
  await saved(page);
  const secondImage = (await savedDocument(page, boards[1]!)).cards.find((card) => card.kind === "image");
  assert(secondImage?.kind === "image" && secondImage.src === uploaded.src);
  assert.equal((await em.execute<{ count: string }[]>("select count(*) from whiteboard_image_references where image_id = ? and expires_at is null", [imageId]))[0]!.count, "2");
  await removeBoard(boards[1]!);
  await page.getByText("This board was removed. Close it and select another.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Close board", exact: true }).click();
  await openBoard(page, board);
  assert.equal((await em.execute<{ count: string }[]>("select count(*) from whiteboard_images where id = ?", [imageId]))[0]!.count, "1");
  checks.push("Deleting a second whiteboard leaves its shared image intact on the first whiteboard.");
  await page.context().close();

  for (const viewport of [{ width: 1024, height: 768 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    const touch = active = await playerSession(browser, "leo", { viewport, hasTouch: true, isMobile: true });
    touch.on("pageerror", (error) => errors.push(error.message));
    await openBoard(touch, board);
    const title = `Touch ${viewport.width}`;
    await touch.getByRole("button", { name: "Sticky note", exact: true }).tap();
    await touch.getByLabel("Title", { exact: true }).fill(title);
    await touch.getByLabel("Card notes", { exact: true }).fill("A quick thought from the tablet.");
    await touch.getByRole("button", { name: "Pink", exact: true }).tap();
    await capture(touch, `touch-${viewport.width}-editor`);
    await touch.getByRole("button", { name: "Close card editor" }).tap();
    await saved(touch);
    const before = (await savedDocument(touch)).cards.find((card) => card.title === title)!;
    await drag(touch, `Move ${title}`, 15, 15, true);
    await drag(touch, `Resize ${title}`, 15, 15, true);
    const after = (await savedDocument(touch)).cards.find((card) => card.id === before.id)!;
    assert.deepEqual([after.x - before.x, after.y - before.y, after.width - before.width, after.height - before.height], [20, 20, 20, 20]);
    await capture(touch, `touch-${viewport.width}-canvas`);
    await touch.getByRole("button", { name: "Board", exact: true }).tap();
    await capture(touch, `touch-${viewport.width}-board`);
    await touch.evaluate(() => document.documentElement.dataset.theme = "dark");
    await capture(touch, `touch-${viewport.width}-dark`);
    await touch.context().close();
    checks.push(`Touch ${viewport.width}×${viewport.height}: movement, resizing, placement, editing, color, canvas/board and light/dark screenshots.`);
  }
  assert.deepEqual(errors, []);
  await removeBoard(board);
  for (let attempt = 0; attempt < 20; attempt++) {
    const rows = await em.execute<{ count: string }[]>("select count(*) from whiteboard_images where id = ?", [imageId]);
    if (rows[0]!.count === "0") break;
    await new Promise((done) => setTimeout(done, 1000));
  }
  assert.equal((await em.execute<{ count: string }[]>("select count(*) from whiteboard_images where id = ?", [imageId]))[0]!.count, "0");
  checks.push("Deleting the final whiteboard removes its image references and PostgreSQL image bytes.");
  await writeFile(resolve(output, "report.json"), JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  await writeFile(resolve(output, "partial-report.json"), JSON.stringify({ checks, error: String(error).split("Call log:")[0] }, null, 2));
  console.error(String(error).split("Call log:")[0]);
  if (active && !active.isClosed()) {
    await active.screenshot({ path: resolve(output, "failure.png") });
    await writeFile(resolve(output, "failure.txt"), `${String(error).split("Call log:")[0]}\n${await active.locator("body").innerText()}`);
  }
  throw new Error(String(error).split("Call log:")[0]);
} finally {
  if (admin && !admin.isClosed()) for (const board of boards) {
    try { await removeBoard(board); } catch (error) { console.error(`Fixture cleanup failed for ${board.id}: ${String(error).split("Call log:")[0]}`); }
  }
  await browser.close();
  await orm.close(true);
}
