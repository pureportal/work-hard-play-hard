import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createRecorder } from "./capture.js";
import { createReviewFixture } from "./fixture.js";

const review = createRecorder(`../../artifacts/application-design-review/${process.env.REVIEW_PHASE ?? "before"}/rooms`);
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const [width, height] of [[1440, 1000], [390, 844], [320, 568], [844, 390]]) {
    for (const theme of ["light", "dark"] as const) {
      const fixture = await createReviewFixture();
      const context = await browser.newContext({ viewport: { width: width!, height: height! }, colorScheme: theme });
      await fixture.install(context, "maya");
      const page = await context.newPage();
      review.observe(page);
      const prefix = `${width}-${theme}`;
      try {
        await page.goto("http://127.0.0.1:5173");
        await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
        await page.waitForLoadState("networkidle");
        await page.getByRole("button", { name: "Build", exact: true }).click();
        for (const tool of ["Wall", "Door", "Window", "Erase", "Select"]) {
          const button = page.getByRole("toolbar", { name: "Layout tools" }).getByRole("button", { name: tool, exact: true });
          await button.click();
          assert.equal(await button.getAttribute("aria-pressed"), "true");
          await review.capture(page, `${prefix}-tool-${tool.toLowerCase()}`);
        }
        const privateRoom = fixture.store.getLayout("floor-studio")!.rooms.find((room) => room.privateEligible)!;
        const room = page.locator(".room-control").filter({ has: page.locator("summary").getByText(privateRoom.name, { exact: true }) });
        await room.locator("summary").click();
        await room.getByRole("combobox").selectOption("assigned");
        for (const checkbox of await room.locator(".room-people input:checked").all()) await checkbox.uncheck();
        await room.locator(".room-validation").scrollIntoViewIfNeeded();
        assert(await room.getByRole("button", { name: "Save", exact: true }).isDisabled());
        await review.capture(page, `${prefix}-room-validation`);
        await room.getByLabel("Name", { exact: true }).scrollIntoViewIfNeeded();
        await review.capture(page, `${prefix}-room-fields`);
        await room.locator(".room-people").getByLabel("Maya Chen", { exact: true }).check();
        await room.getByLabel("Allow knocking", { exact: true }).check();
        await room.getByRole("button", { name: "Save", exact: true }).click();
        await page.waitForFunction(() => !document.querySelector(".room-validation"));
        assert(fixture.store.getLayout("floor-studio")!.rooms.find((item) => item.id === privateRoom.id)!.access.knockable);
        await review.capture(page, `${prefix}-room-saved`);
        await page.getByLabel("Player assets in open rooms", { exact: true }).click();
        await review.capture(page, `${prefix}-game-placement-policy`);
        await page.getByRole("button", { name: "Close build tools", exact: true }).click();
        await page.getByRole("button", { name: "Sign out", exact: true }).click();
        await page.getByLabel("Username or email").fill("jonas");
        await page.getByLabel("Password", { exact: true }).fill("northstar");
        await page.getByRole("button", { name: "Sign in", exact: true }).click();
        await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
        await page.getByRole("button", { name: "Build", exact: true }).click();
        await page.getByRole("tab", { name: "Shop", exact: true }).click();
        await page.locator(".asset-rarity-filter select").selectOption("legendary");
        await review.capture(page, `${prefix}-shop-empty`);
        const claim = page.getByRole("button", { name: "Claim 50", exact: true });
        if (await claim.count()) {
          await claim.click();
          await page.getByText("Claimed", { exact: true }).waitFor();
        }
        await page.locator(".daily-reward").scrollIntoViewIfNeeded();
        await review.capture(page, `${prefix}-daily-claimed`);
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
