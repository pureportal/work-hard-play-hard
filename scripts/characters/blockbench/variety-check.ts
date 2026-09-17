import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import {
  CHARACTER_FACES, CHARACTER_HAIRSTYLES, CHARACTER_HEADWEAR, CHARACTER_OUTFITS,
  DEFAULT_CHARACTER_APPEARANCE, type CharacterAppearance,
} from "../../../packages/shared/src/character.js";
import { characterCategories } from "../../../apps/client/src/components/character-options.js";
import { characterAppearanceSchema } from "../../../apps/server/src/avatar/character-schema.js";
import { installAssetFixture } from "../../world-assets/playwright-fixture.js";
import { installWorldProbe } from "../playwright-animation.js";
import { reviewCreatorLayouts } from "./layout-review.js";

const output = fileURLToPath(new URL("../../../artifacts/character-variety/browser", import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true, reducedMotion: "reduce" });
const fixture = await installAssetFixture(context, "user-maya", { x: 704, y: 600 }, { currentPlayerOnly: true });
const layout = fixture.store.getLayout("floor-studio")!;
layout.objects = [];
layout.walls = [];
layout.openings = [];
layout.rooms = [];
layout.revision++;
fixture.store.updateMemberCharacter("user-maya", DEFAULT_CHARACTER_APPEARANCE);
await context.route("**/v1/members/me/character", async route => {
  const character = characterAppearanceSchema.parse(route.request().postDataJSON());
  const member = fixture.store.updateMemberCharacter("user-maya", character);
  await route.fulfill({ json: member });
  fixture.publish({ type: "member.updated", member });
});
const page = await context.newPage();
await installWorldProbe(page);
const report: { saved: unknown[]; options: unknown[]; layouts: unknown[]; playback: unknown[]; errors: string[] } = { saved: [], options: [], layouts: [], playback: [], errors: [] };
page.on("pageerror", error => report.errors.push(error.message));
page.on("response", response => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
const ready = () => page.waitForFunction(() => document.querySelector<HTMLButtonElement>(".character-editor-actions .primary-button")?.disabled === false);
const optionsReady = () => page.waitForFunction(() => [...document.querySelectorAll<HTMLCanvasElement>(".character-option canvas")].every(canvas => canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0)));
const worldReady = () => page.waitForFunction(() => Boolean(globalThis.findAvatar("You")));

try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await worldReady();
  const additions = { faces: CHARACTER_FACES.slice(6), hair: CHARACTER_HAIRSTYLES.slice(14), headwear: CHARACTER_HEADWEAR.slice(8), outfits: CHARACTER_OUTFITS.slice(18) };
  const selected = new Set<string>();
  for (const [index, face] of additions.faces.entries()) {
    const appearance: CharacterAppearance = {
      face, hairstyle: additions.hair[index]!, headwear: additions.headwear[index]!,
      upperBody: additions.outfits[index % 6]!, lowerBody: additions.outfits[(index + 2) % 6]!, shoes: additions.outfits[(index + 4) % 6]!,
    };
    await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
    await ready();
    for (const category of characterCategories) {
      await page.getByRole("tab", { name: category.label, exact: true }).click();
      const option = category.options.find(option => option.value === appearance[category.id])!;
      await page.getByRole("button", { name: option.label, exact: true }).click();
      await ready();
      selected.add(`${category.id}/${option.value}`);
    }
    const preview = await page.locator(".character-stage canvas").evaluate(async (element, appearance) => {
      const { renderCharacter } = await import("/src/character-renderer.ts" as string);
      const expected = (await renderCharacter(appearance)).getContext("2d").getImageData(24, 0, 72, 120).data;
      const canvas = element as HTMLCanvasElement;
      const actual = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
      return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
    }, appearance);
    assert(preview, `Preview mismatch: ${JSON.stringify(appearance)}`);
    await page.locator(".character-stage").screenshot({ path: `${output}/preview-${index + 1}.png` });
    await page.getByRole("button", { name: "Use character", exact: true }).click();
    await page.getByRole("dialog", { name: "Avatar", exact: true }).waitFor({ state: "hidden" });
    assert.deepEqual(fixture.store.getMember("user-maya")!.character, appearance);
    await page.reload({ waitUntil: "domcontentloaded" });
    await worldReady();
    const world = await page.evaluate(async appearance => {
      const { renderCharacter } = await import("/src/character-renderer.ts" as string);
      const sprite = globalThis.findAvatar("You")!;
      const source = sprite.texture!.source as unknown as { resource: HTMLCanvasElement };
      const actual = source.resource.getContext("2d")!.getImageData(0, 0, 960, 1920).data;
      const expected = (await renderCharacter(appearance)).getContext("2d").getImageData(0, 0, 960, 1920).data;
      return { matches: actual.every((value, index) => value === expected[index]), width: sprite.width, height: sprite.height };
    }, appearance);
    assert(world.matches && world.width === 80 && world.height === 80);
    await page.screenshot({ path: `${output}/world-${index + 1}.png` });
    report.saved.push({ appearance, preview, world });
  }
  assert.equal(selected.size, 66, "Select every new asset in the actual designer");
  await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
  await ready();
  assert.equal(await page.getByText("Gender", { exact: true }).count(), 0);
  for (const direction of ["down", "left", "right", "up"]) {
    await page.getByLabel("Facing direction", { exact: true }).selectOption(direction);
    for (const category of characterCategories) {
      await page.getByRole("tab", { name: category.label, exact: true }).click();
      await optionsReady();
      assert.equal(await page.locator(".character-option").count(), category.options.length);
      assert.deepEqual(await page.locator(".character-option > span:last-child").allTextContents(), category.options.map(option => option.label));
      report.options.push({ category: category.id, direction, count: category.options.length });
    }
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const motion of ["idle", "walk", "sit", "listen", "sit-listen"]) for (const direction of ["down", "left", "right", "up"]) {
    await page.getByLabel("Animation", { exact: true }).selectOption(motion);
    await page.getByLabel("Facing direction", { exact: true }).selectOption(direction);
    await ready();
    const frames = await page.locator(".character-stage canvas").evaluate(async element => {
      const canvas = element as HTMLCanvasElement;
      const samples = new Set<string>(), start = performance.now();
      while (performance.now() - start < 900) {
        samples.add(canvas.toDataURL());
        await new Promise(requestAnimationFrame);
      }
      return samples.size;
    });
    assert(frames >= 2, `${motion}/${direction} must animate`);
    report.playback.push({ motion, direction, frames });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByLabel("Animation", { exact: true }).selectOption("idle");
  await page.getByLabel("Facing direction", { exact: true }).selectOption("down");
  report.layouts = await reviewCreatorLayouts(page, output);
  assert.deepEqual(report.errors, []);
  console.log(`Verified ${selected.size} new selections, ${report.saved.length} saved appearances, 592 directional option previews, ${report.playback.length} animation views and ${report.layouts.length} layouts.`);
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  fixture.stop();
  await writeFile(`${output}/review.json`, JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
