import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import type { WorkspaceStore } from "../../apps/server/src/store.js";

export async function verifyAvatarEditor(page: Page, store: WorkspaceStore) {
  await page.context().route("**/v1/members/me/character", async route => {
    assert.equal(route.request().method(), "PUT");
    await route.fulfill({ json: store.updateMemberCharacter("user-jonas", route.request().postDataJSON()) });
  });
  const editor = page.locator(".character-editor");
  const ready = () => page.waitForFunction(() => (document.querySelector(".character-editor-actions .primary-button") as HTMLButtonElement | null)?.disabled === false);
  const animations = [];
  for (const motion of ["Idle", "Walk", "Sit", "Listen", "Sit & listen"]) {
    await editor.getByRole("button", { name: motion, exact: true }).click();
    for (const direction of ["Front", "Left", "Back", "Right"]) {
      await editor.getByRole("button", { name: direction, exact: true }).click();
      await ready();
      const visible = await editor.locator(".character-stage canvas").evaluate(canvas => {
        const image = canvas as HTMLCanvasElement;
        return image.getContext("2d")!.getImageData(0, 0, image.width, image.height).data.some((value, index) => index % 4 === 3 && value > 0);
      });
      assert(visible, `${motion}/${direction} is blank`);
      animations.push({ motion, direction });
    }
  }
  await ready();
  for (const [tab, option] of [["Face", "Shy"], ["Hair", "Ink hime cut"], ["Tops", "Lilac kimono"], ["Bottoms", "Sailor trousers"], ["Shoes", "Leather boots"], ["Headwear", "Goggles"]]) {
    await editor.getByRole("tab", { name: tab!, exact: true }).click();
    await editor.getByRole("button", { name: option!, exact: true }).click();
    await ready();
  }
  await editor.getByRole("button", { name: "Use character", exact: true }).click();
  await editor.waitFor({ state: "hidden" });
  const appearance = store.getMember("user-jonas")!.character;
  assert.deepEqual(appearance, { face: "shy", hairstyle: "hime", upperBody: "kimono", lowerBody: "sailor", shoes: "ranger", headwear: "goggles" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  await page.waitForFunction(() => Boolean(globalThis.findAvatar("You")));
  return { animations, savedAndReloaded: appearance };
}
