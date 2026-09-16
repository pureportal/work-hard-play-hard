import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import { CHARACTER_HAIRSTYLES, DEFAULT_CHARACTER_APPEARANCE, type CharacterAppearance } from "../../../packages/shared/src/character.js";
import { installAssetFixture } from "../../world-assets/playwright-fixture.js";
import { installWorldProbe } from "../playwright-animation.js";
import { reviewCreatorLayouts } from "./layout-review.js";

const outfits = [
  ["cyber", "Neon runner", "Circuit cargos", "Neon high-tops"],
  ["pirate", "Corsair coat", "Corsair trousers", "Corsair boots"],
  ["astronaut", "Orbital suit", "Orbital trousers", "Moonwalk boots"],
  ["dragon", "Dragon armor", "Dragon greaves", "Dragon claws"],
  ["jester", "Harlequin tunic", "Harlequin trousers", "Jester slippers"],
  ["frog", "Froggy hoodie", "Lily-pad shorts", "Frog slippers"],
  ["biker", "Biker vest", "Ripped black jeans", "Studded boots"],
  ["velvet", "Velvet corset", "Velvet slit skirt", "Velvet heels"],
  ["starlight", "Starlight halter", "Starlight mini", "Silver platforms"],
  ["sunset", "Sunset crop top", "Sunset shorts", "Sunset sandals"],
] as const;
const output = process.argv.find(argument => argument.startsWith("--output="))?.slice(9) ?? fileURLToPath(new URL("../../../artifacts/character-expansion/browser", import.meta.url));
const layoutsOnly = process.argv.includes("--layouts-only");
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
  const character = route.request().postDataJSON() as CharacterAppearance;
  const member = fixture.store.updateMemberCharacter("user-maya", character);
  await route.fulfill({ json: member });
  fixture.publish({ type: "member.updated", member });
});
const page = await context.newPage();
await installWorldProbe(page);
const report: { saved: unknown[]; layouts: unknown[]; playback: unknown[]; errors: string[] } = { saved: [], layouts: [], playback: [], errors: [] };
page.on("pageerror", error => report.errors.push(error.message));
page.on("response", response => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
const ready = () => page.waitForFunction(() => document.querySelector<HTMLButtonElement>(".character-editor-actions .primary-button")?.disabled === false);
const worldReady = () => page.waitForFunction(() => Boolean(globalThis.findAvatar("You")));

try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await worldReady();
  for (const [index, [outfit, topName, bottomName, shoeName]] of (layoutsOnly ? [] : outfits).entries()) {
    const appearance = { ...DEFAULT_CHARACTER_APPEARANCE, hairstyle: CHARACTER_HAIRSTYLES[index]!, upperBody: outfit, lowerBody: outfit, shoes: outfit };
    fixture.store.updateMemberCharacter("user-maya", { ...DEFAULT_CHARACTER_APPEARANCE, hairstyle: appearance.hairstyle });
    await page.reload({ waitUntil: "domcontentloaded" });
    await worldReady();
    await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
    await ready();
    for (const [tab, name] of [["Tops", topName], ["Bottoms", bottomName], ["Shoes", shoeName]]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await page.getByRole("button", { name, exact: true }).click();
      await ready();
    }
    const preview = await page.locator(".character-stage canvas").evaluate(async (element, appearance) => {
      const { renderCharacter } = await import("/src/character-renderer.ts" as string);
      const expected = (await renderCharacter(appearance)).getContext("2d").getImageData(24, 0, 72, 120).data;
      const canvas = element as HTMLCanvasElement;
      const actual = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
      return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
    }, appearance);
    assert(preview, `${outfit}: preview must match composition`);
    await page.locator(".character-stage").screenshot({ path: `${output}/preview-${outfit}.png` });
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
    assert(world.matches && world.width === 80 && world.height === 80, `${outfit}: world texture after reload`);
    await page.screenshot({ path: `${output}/world-${outfit}.png` });
    report.saved.push({ appearance, preview, world });
  }
  await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
  await ready();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const motion of layoutsOnly ? [] : ["Idle", "Walk", "Sit", "Listen", "Sit & listen"]) for (const direction of ["Front", "Left", "Right", "Back"]) {
    await page.getByRole("button", { name: motion, exact: true }).click();
    await page.getByRole("button", { name: direction, exact: true }).click();
    await ready();
    const frames = await page.locator(".character-stage canvas").evaluate(async element => {
      const canvas = element as HTMLCanvasElement;
      const samples = new Set<string>();
      const start = performance.now();
      while (performance.now() - start < 850) {
        samples.add(canvas.toDataURL());
        await new Promise(requestAnimationFrame);
      }
      return samples.size;
    });
    assert(frames >= 2, `${motion}/${direction} must animate`);
    report.playback.push({ motion, direction, frames });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Idle", exact: true }).click();
  await page.getByRole("button", { name: "Front", exact: true }).click();
  report.layouts = await reviewCreatorLayouts(page, output);
  assert.deepEqual(report.errors, []);
  console.log(`Verified ${report.saved.length * 3} selections, ${report.saved.length} saved world appearances, ${report.playback.length} animation views and ${report.layouts.length} layouts.`);
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  fixture.stop();
  await writeFile(`${output}/${layoutsOnly ? "layouts" : "review"}.json`, JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
