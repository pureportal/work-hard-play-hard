import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createRecorder } from "./capture.js";
import { createReviewFixture } from "./fixture.js";

const review = createRecorder(`../../artifacts/application-design-review/${process.env.REVIEW_PHASE ?? "before"}/edges`);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const image = { name: "office.png", mimeType: "image/png", buffer: await readFile("../../apps/client/public/world-assets/plant-palm/forest.png") };

try {
  for (const [width, height] of [[1440, 1000], [390, 844], [320, 568], [844, 390]]) {
    for (const theme of ["light", "dark"] as const) {
      const fixture = await createReviewFixture();
      const conversation = fixture.store.getBootstrap("user-maya").conversations.find((item) => item.type === "team")!;
      for (let index = 0; index < 35; index++) fixture.store.addMessage(conversation.id, index % 2 ? "user-maya" : "user-leo", `Review message ${index + 1}. A longer discussion about the next team review and its notes.`);
      const context = await browser.newContext({ viewport: { width: width!, height: height! }, colorScheme: theme });
      await fixture.install(context);
      const page = await context.newPage();
      review.observe(page);
      const prefix = `${width}-${theme}`;
      try {
        const session = Promise.withResolvers<void>();
        await page.route("**/v1/auth/session", async (route) => { await session.promise; await route.fallback(); });
        await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
        await page.getByLabel("Loading office").waitFor();
        await review.capture(page, `${prefix}-loading`);
        session.resolve();
        await page.getByLabel("Username or email").waitFor();
        await page.unroute("**/v1/auth/session");
        await page.getByRole("tab", { name: "Create account", exact: true }).click();
        await page.getByRole("button", { name: "Server", exact: true }).click();
        await page.locator(".auth-shell").evaluate((node) => { node.scrollTop = 0; });
        assert((await page.locator(".auth-brand").boundingBox())!.y >= 0);
        await review.capture(page, `${prefix}-registration-top`);
        await page.getByRole("button", { name: "Connect", exact: true }).scrollIntoViewIfNeeded();
        const connect = (await page.getByRole("button", { name: "Connect", exact: true }).boundingBox())!;
        assert(connect.y >= 0 && connect.y + connect.height <= height!);
        await review.capture(page, `${prefix}-registration-bottom`);
        await page.goto("http://127.0.0.1:5173/#magic=expired-review-link");
        await page.reload();
        await page.getByRole("alert").waitFor();
        await review.capture(page, `${prefix}-expired-link`);
        await page.getByLabel("Username or email").fill("maya");
        await page.getByLabel("Password", { exact: true }).fill("northstar");
        const login = Promise.withResolvers<void>();
        await page.route("**/v1/auth/login", async (route) => { await login.promise; await route.fallback(); });
        await page.getByRole("button", { name: "Sign in", exact: true }).click();
        await page.getByRole("button", { name: "Signing in…", exact: true }).waitFor();
        await review.capture(page, `${prefix}-signing-in`);
        login.resolve();
        await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
        await page.getByRole("button", { name: "Messages", exact: true }).click();
        await page.getByRole("tab", { name: conversation.name, exact: true }).click();
        await page.locator(".message-list").evaluate((node) => { node.scrollTop = 0; });
        await page.getByRole("button", { name: "Jump to latest", exact: true }).waitFor();
        await review.capture(page, `${prefix}-message-history`);
        await page.getByRole("button", { name: "Jump to latest", exact: true }).click();
        assert.equal(await page.getByRole("button", { name: "Jump to latest", exact: true }).count(), 0);
        const tabs = page.getByRole("tablist", { name: "Conversations" });
        await tabs.getByRole("tab", { selected: true }).focus();
        await page.keyboard.press("End");
        assert.equal(await tabs.getByRole("tab").last().getAttribute("aria-selected"), "true");
        await page.keyboard.press("Home");
        const uploading = Promise.withResolvers<void>();
        await page.route("**/v1/conversations/*/images", async (route) => { await uploading.promise; await route.fallback(); });
        await page.locator(".message-composer input[type=file]").setInputFiles(image);
        await page.locator(".composer-attachment:disabled").waitFor();
        await review.capture(page, `${prefix}-image-uploading`);
        uploading.resolve();
        await page.locator(".chat-image img").last().waitFor();
        await page.locator(".chat-image img").last().evaluate(async (node) => { await (node as HTMLImageElement).decode(); });
        await review.capture(page, `${prefix}-image-sent`);
        const [popup] = await Promise.all([page.waitForEvent("popup"), page.locator(".chat-image").last().click({ noWaitAfter: true })]);
        await popup.waitForLoadState();
        assert(popup.url().includes("/v1/"));
        await popup.close();
        await page.unroute("**/v1/conversations/*/images");
        await page.route("**/v1/conversations/*/images", (route) => route.fulfill({ status: 500, json: { message: "Image could not be sent. Try again." } }));
        await page.locator(".message-composer input[type=file]").setInputFiles(image);
        await page.locator(".composer-error").waitFor();
        await review.capture(page, `${prefix}-image-error`);
        await page.getByRole("button", { name: "Settings", exact: true }).click();
        const logo = Promise.withResolvers<void>();
        await page.route("**/v1/admin/corporate-identity/logo", async (route) => { await logo.promise; await route.fallback(); });
        await page.locator(".corporate-logo-actions input").setInputFiles(image);
        await page.getByRole("button", { name: "Uploading…", exact: true }).waitFor();
        await review.capture(page, `${prefix}-logo-uploading`);
        logo.resolve();
        await page.locator(".corporate-logo-actions").getByRole("button", { name: "Remove", exact: true }).waitFor();
        await review.capture(page, `${prefix}-logo-uploaded`);
        await page.locator(".corporate-logo-actions").getByRole("button", { name: "Remove", exact: true }).click();
        await page.locator(".corporate-logo-actions").getByRole("button", { name: "Remove", exact: true }).waitFor({ state: "hidden" });
        await page.getByRole("button", { name: "Close settings", exact: true }).click();
        await page.route("**/characters/anime/portraits/**", (route) => route.abort());
        await page.reload();
        await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
        await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
        await page.locator(".character-stage .character-preview-error").waitFor();
        assert(await page.getByRole("button", { name: "Use character", exact: true }).isDisabled());
        await review.capture(page, `${prefix}-avatar-artwork-error`);
        await page.unroute("**/characters/anime/portraits/**");
        await page.locator(".character-stage").getByRole("button", { name: "Retry", exact: true }).click();
        await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>(".character-editor-actions .primary-button")?.disabled);
        const options = page.getByRole("tablist", { name: "Appearance" });
        await options.getByRole("tab", { selected: true }).focus();
        await page.keyboard.press("End");
        await page.getByRole("tabpanel").getByRole("button").last().scrollIntoViewIfNeeded();
        await review.capture(page, `${prefix}-avatar-bottom`);
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        fixture.store.getMeetings().splice(0);
        await page.route("**/world-assets/**", (route) => route.abort());
        await page.reload();
        await page.locator(".world-artwork-error").waitFor();
        const close = page.getByRole("button", { name: "Close people", exact: true });
        if (await close.count()) await close.click();
        await review.capture(page, `${prefix}-world-artwork-error`);
        await page.unroute("**/world-assets/**");
        if (process.env.REVIEW_PHASE === "after") {
          const banner = (await page.locator(".world-artwork-error").boundingBox())!;
          const topBar = (await page.locator(".top-bar").boundingBox())!;
          assert(banner.y >= topBar.y + topBar.height);
          assert(banner.x >= 0 && banner.x + banner.width <= width!);
        }
        await Promise.all([page.waitForEvent("load"), page.locator(".world-artwork-error").getByRole("button", { name: "Reload", exact: true }).click({ force: process.env.REVIEW_PHASE !== "after" })]);
        await page.waitForLoadState("networkidle");
        await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
        assert.equal(await page.locator(".world-artwork-error").count(), 0);
        await page.getByRole("button", { name: "Meetings", exact: true }).click();
        await page.getByLabel("No meetings", { exact: true }).waitFor();
        await review.capture(page, `${prefix}-meetings-empty`);
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
