import { chromium, type Page } from "playwright-core";
import { createRecorder } from "./capture.js";

const output = `../../artifacts/application-design-review/${process.env.REVIEW_PHASE ?? "before"}/live`;
const review = createRecorder(output);
const browser = await chromium.launch({ channel: "msedge", headless: true });

async function panel(page: Page, name: string) {
  const button = page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("button", { name, exact: true });
  if (await button.getAttribute("aria-pressed") !== "true") await button.click();
}

try {
  for (const account of ["maya", "leo", "jonas", "owen"]) {
    if (process.env.REVIEW_ACCOUNTS && !process.env.REVIEW_ACCOUNTS.split(",").includes(account)) continue;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });
    const page = await context.newPage();
    review.observe(page);
    try {
      await page.goto("http://127.0.0.1:5173");
      await page.getByLabel("Username or email").fill(account);
      await page.getByLabel("Password", { exact: true }).fill("northstar");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.locator(".world-canvas canvas, .auth-error").first().waitFor();
      if (await page.locator(".auth-error").count()) {
        review.blockers.push(`${account}: ${await page.locator(".auth-error").innerText()}`);
        continue;
      }
      await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
      for (const [width, height] of [[1440, 1000], [390, 844]]) {
        await page.setViewportSize({ width: width!, height: height! });
        for (const theme of ["light", "dark"]) {
          const changeTheme = page.getByRole("button", { name: `Use ${theme} mode`, exact: true });
          if (await changeTheme.count()) await changeTheme.click();
          const prefix = `${account}-${width}-${theme}`;
          await panel(page, "People");
          await review.capture(page, `${prefix}-people`);
          const other = page.locator('.person-main:not([aria-label$="(you)"])').first();
          await other.click();
          await review.capture(page, `${prefix}-person-expanded`);
          await page.getByRole("textbox", { name: "Search people" }).fill("zzzz-no-matches");
          await review.capture(page, `${prefix}-people-empty`);
          await page.getByRole("textbox", { name: "Search people" }).fill("");
          const invite = page.getByRole("button", { name: "Invite member", exact: true });
          if (await invite.count()) {
            await invite.click();
            for (const role of ["guest", "member"]) await page.locator(".invite-form select").selectOption(role);
            await review.capture(page, `${prefix}-invite`);
            await invite.click();
          }
          await panel(page, "Messages");
          const tabs = page.getByRole("tablist", { name: "Conversations" }).getByRole("tab");
          for (let index = 0; index < await tabs.count(); index++) {
            await tabs.nth(index).click();
            if (account === "maya" || index === 0) await review.capture(page, `${prefix}-messages-${index}`);
          }
          await page.locator(".message-composer input:not([type=file])").fill("Draft");
          await review.capture(page, `${prefix}-message-draft`);
          await panel(page, "Meetings");
          await review.capture(page, `${prefix}-meetings`);
          await panel(page, "Settings");
          await review.capture(page, `${prefix}-settings`);
          const personal = page.locator(".kidnapping-policy select").last();
          await personal.scrollIntoViewIfNeeded();
          await review.capture(page, `${prefix}-settings-personal`);
          const build = page.getByRole("button", { name: "Build", exact: true });
          if (await build.count()) {
            await panel(page, "Build");
            await review.capture(page, `${prefix}-build`);
            const shop = page.getByRole("tab", { name: "Shop", exact: true });
            if (await shop.count()) {
              await shop.click();
              await review.capture(page, `${prefix}-shop`);
            }
            const categories = page.locator(".asset-category-tabs [role=tab]");
            for (let index = 0; index < await categories.count(); index++) {
              await categories.nth(index).click();
              if (account === "maya" || account === "jonas") await review.capture(page, `${prefix}-catalog-${index}`);
            }
            await page.locator(".asset-rarity-filter select").selectOption("legendary");
            await review.capture(page, `${prefix}-rarity`);
            const rooms = page.locator(".room-control summary");
            for (let index = 0; index < await rooms.count(); index++) {
              await rooms.nth(index).click();
              if (account === "maya") await review.capture(page, `${prefix}-room-${index}`);
              await rooms.nth(index).click();
            }
            await page.getByRole("button", { name: "Close build tools", exact: true }).click();
          } else {
            await page.getByRole("button", { name: "Close settings", exact: true }).click();
          }
          await page.getByRole("button", { name: "React", exact: true }).click();
          await review.capture(page, `${prefix}-reactions`);
          await page.keyboard.press("Escape");
          await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
          await page.getByRole("button", { name: "Use character", exact: true }).waitFor();
          await review.capture(page, `${prefix}-avatar`);
          if (account === "maya") {
            for (const name of ["Face", "Hair", "Tops", "Bottoms", "Shoes", "Headwear"]) {
              await page.getByRole("tab", { name, exact: true }).click();
              await page.locator(".character-option").last().click();
              await review.capture(page, `${prefix}-avatar-${name.toLowerCase()}`);
            }
            for (const name of ["Back", "Left", "Right", "Front", "Walk", "Idle", "Male", "Female", "Randomize"]) {
              await page.getByRole("dialog").getByRole("button", { name, exact: true }).click();
            }
          }
          await page.getByRole("button", { name: "Cancel", exact: true }).click();
          await review.capture(page, `${prefix}-studio`);
          await page.getByRole("combobox", { name: "Floor", exact: true }).selectOption("floor-rooftop");
          await review.capture(page, `${prefix}-rooftop`);
          await page.getByRole("combobox", { name: "Floor", exact: true }).selectOption("floor-studio");
        }
      }
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await page.getByLabel("Username or email").waitFor();
    } catch (error) {
      await review.capture(page, `${account}-failure`);
      review.blockers.push(`${account}: ${String(error)}`);
      console.error(String(error));
    } finally {
      await context.close();
      await review.save();
    }
  }
} finally {
  await browser.close();
  await review.save();
}
