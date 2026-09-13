import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Page } from "playwright-core";
import { getPlacedAssetCells, getWorkObjectState, requireAssetDefinition, type WorldObject } from "../packages/shared/src/index.js";
import { createWorkFixture } from "./work-objects-fixture.js";

const output = "../../artifacts/work-features";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const issues: string[] = [];
const verified: string[] = [];

async function ready(page: Page) {
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (error) => issues.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") issues.push(message.text()); });
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.locator(".world-canvas canvas").waitFor();
  await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
  assert.equal(await page.getByRole("button", { name: "Close game", exact: true }).count(), 0);
  await frames(page);
}

async function frames(page: Page) {
  await page.evaluate(async () => {
    for (let index = 0; index < 24; index++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

async function capture(page: Page, name: string) {
  await page.screenshot({ path: `${output}/${name}.png`, animations: "disabled" });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Page must fit the viewport");
  const dialog = page.getByRole("dialog");
  if (await dialog.count()) {
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize()!;
    assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1);
    const close = await page.getByRole("button", { name: "Close board" }).boundingBox();
    assert(close && close.height >= 40 && close.width >= 40);
    const footer = await page.locator(".work-object-dialog > footer").boundingBox();
    assert(footer && footer.y + footer.height <= viewport.height);
  }
}

async function placementPoint(page: Page, touch = false) {
  const canvas = await page.locator(".world-canvas canvas").boundingBox();
  const panel = await page.locator(".build-panel").boundingBox();
  assert(canvas && panel);
  const viewport = page.viewportSize()!;
  const points = touch
    ? [230, 300, 340, 180, 140].flatMap((y) => [150, 210, 270, 110, 320].map((x) => ({ x, y })))
    : [0.48, 0.57, 0.4, 0.66, 0.32].flatMap((y) => [0.53, 0.42, 0.6, 0.32, 0.7].map((x) => ({ x: canvas.x + canvas.width * x, y: canvas.y + canvas.height * y })));
  for (const point of points) {
    if (point.x >= viewport.width - 20 || point.y >= viewport.height - 20 || (point.x >= panel.x && point.y >= panel.y)) continue;
    if (touch) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.move(point.x, point.y);
    await frames(page);
    if (await page.locator(".placement-confirm").isEnabled()) return point;
  }
  throw new Error("No valid visible placement point");
}

async function openNearby(page: Page, object: WorldObject) {
  const select = page.getByRole("combobox", { name: "Active interaction" });
  await page.waitForFunction(({ id, name }) => {
    const select = document.querySelector<HTMLSelectElement>('[aria-label="Active interaction"]');
    return [...(select?.options ?? [])].some((option) => option.value === id)
      || (document.querySelector('.interaction-panel strong')?.textContent === name
        && document.querySelector('.interaction-panel button.primary-button')?.textContent === 'Open board');
  }, { id: object.id, name: object.label ?? requireAssetDefinition(object.assetId).name }, { timeout: 30_000 });
  if (await select.count()) await select.selectOption(object.id);
  await page.getByRole("region", { name: "Nearby actions" }).getByRole("button", { name: "Open board", exact: true }).click();
  await page.getByRole("dialog").waitFor();
}

async function selectPlaced(page: Page, point: { x: number; y: number }) {
  await frames(page);
  await page.mouse.click(point.x, point.y - 24);
}

async function toggleTask(page: Page, text: string, completed: boolean, touch = false) {
  const checkbox = page.getByRole("checkbox", { name: text, exact: true });
  assert.equal(await checkbox.isChecked(), !completed);
  if (touch) await checkbox.tap();
  else await checkbox.click();
  await page.waitForFunction(({ text, completed }) => [...document.querySelectorAll('.checklist-items label')]
    .some((label) => label.textContent === text && label.querySelector('input')?.checked === completed), { text, completed });
}

try {
  const fixture = createWorkFixture();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await fixture.install(context);
  const page = await context.newPage();
  try {
    await ready(page);
    const placed: WorldObject[] = [];
    for (const name of ["Whiteboard", "Checklist"]) {
      await page.getByRole("button", { name: "Build", exact: true }).click();
      await page.getByRole("tab", { name: "Equipment", exact: true }).click();
      await page.getByRole("button", { name, exact: true }).click();
      await page.getByRole("radio", { name: "Violet", exact: true }).click();
      for (const direction of ["South", "West", "North", "East"]) {
        await page.getByRole("button", { name: `Rotate asset clockwise, currently facing ${direction}` }).click();
      }
      await capture(page, `desktop-${name.toLowerCase()}-catalog`);
      const point = await placementPoint(page);
      await capture(page, `desktop-${name.toLowerCase()}-preview`);
      const previous = fixture.store.getLayout("floor-studio")!.objects.length;
      const canvas = await page.locator(".world-canvas canvas").boundingBox();
      assert(canvas);
      await page.mouse.click(point.x, point.y);
      await page.waitForFunction(() => document.querySelector(".placement-confirm")?.hasAttribute("disabled"));
      assert.equal(fixture.store.getLayout("floor-studio")!.objects.length, previous + 1);
      const object = fixture.store.getLayout("floor-studio")!.objects.at(-1)!;
      placed.push(object);
      assert.equal(object.variantId, "violet");
      assert(getPlacedAssetCells(object).every((cell) => cell.worldX % 16 === 0 && cell.worldY % 16 === 0));
      await page.mouse.click(point.x, point.y);
      assert.equal(fixture.store.getLayout("floor-studio")!.objects.length, previous + 1);
      await page.getByRole("button", { name: "Close build tools" }).click();
      await selectPlaced(page, point);
      const actions = page.getByLabel("Selected place");
      await actions.waitFor();
      assert((await actions.innerText()).includes(name));
      const walk = actions.getByRole("button", { name: "Walk to board" });
      if (await walk.count()) { await walk.click(); await openNearby(page, object); }
      else await actions.getByRole("button", { name: "Open board" }).click();
      if (name === "Whiteboard") {
        await page.getByRole("textbox", { name: "Notes" }).fill("Release plan\n\nReview the demo\nPrepare the handoff");
        await page.getByRole("button", { name: "Save", exact: true }).click();
      } else {
        for (const text of ["Review the demo", "Prepare the handoff"]) {
          await page.getByRole("textbox", { name: "New item" }).fill(text);
          await page.getByRole("button", { name: "Add", exact: true }).click();
          await page.getByRole("textbox", { name: "New item" }).waitFor({ state: "visible" });
          await page.waitForFunction(() => document.querySelector<HTMLInputElement>('[aria-label="New item"]')?.value === "");
        }
        await toggleTask(page, "Review the demo", true);
      }
      await page.getByText("Saved", { exact: true }).waitFor();
      await capture(page, `desktop-${name.toLowerCase()}`);
      await page.getByRole("button", { name: "Close board" }).click();
    }
    verified.push("Desktop: both catalog entries, all design rotations, previews, exact 16px placement, overlap rejection, object selection, walk-to and nearby actions, notes and checklist saves.");

    const secondContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const maya = fixture.runtime.serializePlayers().find((player) => player.userId === "user-maya")!;
    fixture.runtime.restorePlayers(fixture.runtime.serializePlayers().map((player) => player.userId === "user-leo" ? { ...player, x: maya.x + 18, y: maya.y } : player));
    await fixture.install(secondContext, "user-leo");
    const second = await secondContext.newPage();
    await ready(second);
    const checklist = placed[1]!;
    await openNearby(page, checklist);
    await openNearby(second, checklist);
    await second.getByRole("button", { name: "Edit Prepare the handoff" }).click();
    await second.getByRole("textbox", { name: "Edit item" }).fill("Prepare release handoff");
    await second.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("checkbox", { name: "Prepare release handoff", exact: true }).waitFor();
    await toggleTask(second, "Review the demo", false);
    await page.waitForFunction(() => !document.querySelector<HTMLInputElement>('.checklist-items input')?.checked);
    await page.getByRole("textbox", { name: "New item" }).fill("My draft task");
    await second.getByRole("textbox", { name: "New item" }).fill("Teammate task");
    await second.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByText("The board changed. Your draft is kept.").waitFor();
    assert.equal(await page.getByRole("textbox", { name: "New item" }).inputValue(), "My draft task");
    await capture(page, "desktop-conflict");
    await page.getByRole("button", { name: "Keep draft" }).click();
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await second.getByRole("checkbox", { name: "My draft task", exact: true }).waitFor();
    await page.getByRole("button", { name: "Remove Teammate task", exact: true }).click();
    await second.getByRole("checkbox", { name: "Teammate task", exact: true }).waitFor({ state: "hidden" });
    await capture(second, "desktop-shared-checklist");
    await second.getByRole("button", { name: "Close board" }).click();
    await secondContext.close();
    await page.getByRole("button", { name: "Close board" }).click();
    await fixture.restore();
    await ready(page);
    await openNearby(page, checklist);
    await page.getByRole("checkbox", { name: "My draft task", exact: true }).waitFor();
    verified.push("Two users: live task edits/completion/removal, concurrent drafts preserved, explicit conflict recovery, reload after MemoryDatabase checkpoint restore.");

    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await capture(page, `checklist-${viewport.width}x${viewport.height}`);
      await page.getByRole("textbox", { name: "New item" }).fill("Reviewaverylongunbrokentasknameforoverflowandwrapping".repeat(3));
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await page.getByText("Saved", { exact: true }).waitFor();
      await capture(page, `checklist-${viewport.width}x${viewport.height}-long`);
      await page.getByRole("button", { name: /^Remove Reviewaverylong/ }).first().click();
      await page.getByText("Saved", { exact: true }).waitFor();
    }
    await page.getByRole("button", { name: "Close board" }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Use dark mode" }).click();
    await openNearby(page, checklist);
    await capture(page, "desktop-dark-checklist");
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, "mobile-dark-checklist");
    await page.getByRole("button", { name: "Close board" }).click();
    verified.push("Checklist layout: desktop and three compact sizes, long task wrapping, fixed actions, progress, and light/dark themes.");
    assert(placed.every((object) => getWorkObjectState(fixture.store.getObject(object.id)!)!.revision > 0));
  } catch (error) {
    await capture(page, "failure");
    await writeFile(`${output}/failure.json`, JSON.stringify({ commands: fixture.commands, errors: fixture.errors, players: fixture.runtime.serializePlayers(), text: await page.locator("body").innerText() }, null, 2));
    throw error;
  } finally {
    await context.close();
    fixture.stop();
  }

  const mobileScenarios = [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]
    .flatMap((viewport) => ["Whiteboard", "Checklist"].map((name) => ({ viewport, name })));
  for (const { viewport, name } of mobileScenarios) {
    const mobileFixture = createWorkFixture();
    mobileFixture.runtime.restorePlayers(mobileFixture.runtime.serializePlayers().map((player) => player.userId === "user-jonas"
      ? { ...player, x: 410, y: 650 } : player));
    const mobileContext = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    await mobileFixture.install(mobileContext, "user-jonas");
    const mobile = await mobileContext.newPage();
    try {
      await ready(mobile);
      await mobile.getByRole("button", { name: "Build", exact: true }).tap();
      await mobile.getByRole("tab", { name: "Shop", exact: true }).tap();
      await mobile.getByRole("tab", { name: "Equipment", exact: true }).tap();
      await mobile.getByRole("button", { name: `Buy ${name}`, exact: true }).tap();
      await mobile.getByRole("tab", { name: "Inventory", exact: true }).tap();
      const row = mobile.locator(".inventory-asset").filter({ hasText: name });
      await row.getByRole("button", { name: "Place", exact: true }).tap();
      await mobile.getByRole("radio", { name: "White", exact: true }).tap();
      for (const direction of ["South", "West", "North", "East"]) {
        await mobile.getByRole("button", { name: `Rotate asset clockwise, currently facing ${direction}` }).tap();
      }
      await capture(mobile, `touch-${viewport.width}-${name.toLowerCase()}-inventory`);
      const point = await placementPoint(mobile, true);
      await capture(mobile, `touch-${viewport.width}-${name.toLowerCase()}-preview`);
      await mobile.locator(".placement-confirm").tap();
      await mobile.locator(".placement-confirm").waitFor({ state: "hidden" });
      const object = mobileFixture.store.getLayout("floor-studio")!.objects.at(-1)!;
      assert.equal(object.ownerUserId, "user-jonas");
      assert.equal(object.assetId, name === "Whiteboard" ? "equipment-whiteboard" : "equipment-checklist");
      await mobile.getByRole("button", { name: "Close build tools" }).tap();
      await frames(mobile);
      await mobile.touchscreen.tap(point.x, point.y - 24);
      await frames(mobile);
      if (!await mobile.getByRole("dialog").isVisible()) {
        const actions = mobile.getByLabel("Selected place");
        await actions.waitFor();
        const walk = actions.getByRole("button", { name: "Walk to board" });
        if (await walk.count()) { await walk.tap(); await openNearby(mobile, object); }
        else await actions.getByRole("button", { name: "Open board" }).tap();
      }
      if (name === "Whiteboard") {
        await mobile.getByRole("textbox", { name: "Notes" }).fill("Release notes\nReview the prototype\nPrepare the handoff");
        await mobile.getByRole("button", { name: "Save", exact: true }).tap();
      } else {
        await mobile.getByRole("textbox", { name: "New item" }).fill("Review the prototype");
        await mobile.getByRole("button", { name: "Add", exact: true }).tap();
        await toggleTask(mobile, "Review the prototype", true, true);
      }
      await mobile.getByText("Saved", { exact: true }).waitFor();
      await capture(mobile, `touch-${viewport.width}-${name.toLowerCase()}`);
      await mobile.getByRole("button", { name: "Close board" }).tap();
      await mobile.reload();
      await mobile.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
      await openNearby(mobile, object);
      if (name === "Whiteboard") assert((await mobile.getByRole("textbox", { name: "Notes" }).inputValue()).includes("Release notes"));
      else assert(await mobile.getByRole("checkbox", { name: "Review the prototype" }).isChecked());
      await mobile.getByRole("button", { name: "Close board" }).tap();
      verified.push(`Touch ${viewport.width}x${viewport.height} ${name}: purchase, Inventory/design/rotation, preview/placement, approach/open, edit/save and reload.`);
    } catch (error) {
      await capture(mobile, `touch-${viewport.width}-failure`);
      await writeFile(`${output}/touch-${viewport.width}-failure.json`, JSON.stringify({ commands: mobileFixture.commands, errors: mobileFixture.errors, text: await mobile.locator("body").innerText() }, null, 2));
      throw error;
    } finally {
      await mobileContext.close();
      mobileFixture.stop();
    }
  }
  assert.deepEqual(issues, []);
  await writeFile(`${output}/report.json`, JSON.stringify({ verified, issues }, null, 2));
  console.log(JSON.stringify({ verified, issues }, null, 2));
} finally {
  await browser.close();
}
