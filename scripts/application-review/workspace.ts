import { chromium, type Page } from "playwright-core";
import { createRecorder } from "./capture.js";
import { createReviewFixture } from "./fixture.js";

const review = createRecorder(`../../artifacts/application-design-review/${process.env.REVIEW_PHASE ?? "before"}/interactions`);
const browser = await chromium.launch({ channel: "msedge", headless: true });

async function panel(page: Page, name: string) {
  const button = page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("button", { name, exact: true });
  if (await button.getAttribute("aria-pressed") !== "true") await button.click();
}

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
        await panel(page, "People");
        await page.getByRole("button", { name: "Invite member", exact: true }).click();
        await review.capture(page, `${prefix}-invite-form`);
        await page.locator(".invite-form input[type=email]").fill("design-review@example.test");
        await page.locator(".invite-form select").selectOption("member");
        await page.locator(".invite-form input[type=checkbox]").check();
        await page.getByRole("button", { name: "Invite", exact: true }).click();
        await page.getByRole("button", { name: "Revoke design-review@example.test", exact: true }).waitFor();
        await page.getByRole("button", { name: "Revoke design-review@example.test", exact: true }).scrollIntoViewIfNeeded();
        await review.capture(page, `${prefix}-invitation-created`);
        await page.getByRole("button", { name: "Revoke design-review@example.test", exact: true }).click();
        await page.getByRole("button", { name: "Jonas Berg", exact: true }).click();
        await page.locator(".person-row-wrap.expanded .role-picker select").selectOption("guest");
        await page.locator(".person-row-wrap.expanded .role-picker select").selectOption("member");
        await review.capture(page, `${prefix}-member-access`);
        await page.getByRole("button", { name: "Message Jonas Berg", exact: true }).click();
        await page.locator(".message-composer input:not([type=file])").fill("A longer message to review wrapping and spacing in this conversation, including https://example.test/a/long/path/with/details.");
        await page.getByRole("button", { name: "Send message", exact: true }).click();
        await page.locator(".chat-message").filter({ hasText: "A longer message" }).waitFor();
        await review.capture(page, `${prefix}-message-sent`);
        await page.locator(".message-composer input[type=file]").setInputFiles({ name: "document.txt", mimeType: "text/plain", buffer: Buffer.from("review") });
        await review.capture(page, `${prefix}-image-validation`);
        await panel(page, "Settings");
        await page.locator(".corporate-logo-actions input[type=file]").setInputFiles({ name: "document.txt", mimeType: "text/plain", buffer: Buffer.from("review") });
        await review.capture(page, `${prefix}-logo-validation`);
        await page.getByLabel("Application name", { exact: true }).fill("");
        await review.capture(page, `${prefix}-identity-disabled`);
        await page.getByLabel("Application name", { exact: true }).fill("Northstar");
        await page.locator(".identity-field select").selectOption("centered");
        await page.getByRole("button", { name: "Save identity", exact: true }).click();
        await page.getByRole("button", { name: "Save identity", exact: true }).waitFor();
        await page.getByLabel("Domains without invitations", { exact: true }).fill("invalid domain");
        await page.locator(".registration-domain-input button").click();
        await review.capture(page, `${prefix}-domain-invalid`);
        await page.getByLabel("Domains without invitations", { exact: true }).fill("a-long-team-name.department.example.test");
        await page.locator(".registration-domain-input button").click();
        await page.locator(".registration-domain-list").scrollIntoViewIfNeeded();
        await review.capture(page, `${prefix}-domain-added`);
        await page.locator(".registration-domain-list button").click();
        await page.locator(".registration-settings .settings-save").click();
        await page.locator(".kidnapping-policy select").last().selectOption("allow_list");
        await page.locator(".kidnapping-member-list").last().getByRole("checkbox").first().click();
        await page.waitForFunction(() => document.querySelector<HTMLInputElement>(".kidnapping-member-list input")?.checked);
        await review.capture(page, `${prefix}-allow-list`);
        await page.locator(".kidnapping-policy select").last().selectOption("block_list");
        await review.capture(page, `${prefix}-block-list`);
        await page.locator(".kidnapping-policy select").last().selectOption("allow_all");
        await page.getByRole("button", { name: "Close settings" }).click();
        await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
        await page.getByRole("button", { name: "Use character", exact: true }).waitFor();
        await review.capture(page, `${prefix}-avatar`);
        await page.route("**/v1/members/me/character", (route) => route.fulfill({ status: 500, json: { message: "Character could not be saved. Try again." } }));
        await page.getByRole("button", { name: "Use character", exact: true }).click();
        await page.getByRole("alert").waitFor();
        await review.capture(page, `${prefix}-avatar-error`);
        await page.unroute("**/v1/members/me/character");
        await page.getByRole("button", { name: "Use character", exact: true }).click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        await panel(page, "Meetings");
        await page.locator(".meeting-card").first().getByRole("button").click();
        await page.locator(".meeting-overlay").waitFor();
        await review.capture(page, `${prefix}-meeting`);
        const chat = page.getByRole("tab", { name: "Chat", exact: true });
        if (await chat.isVisible()) await chat.click();
        await page.getByRole("textbox", { name: "Meeting message", exact: true }).fill("Reviewing the meeting chat layout.");
        await page.getByRole("button", { name: "Send meeting message", exact: true }).click();
        await review.capture(page, `${prefix}-meeting-chat`);
        const video = page.getByRole("tab", { name: "Video", exact: true });
        if (await video.isVisible()) await video.click();
        await page.locator(".meeting-controls").getByRole("button", { name: "Turn camera on", exact: true }).click();
        await page.getByText("Check media permission.", { exact: true }).waitFor();
        await review.capture(page, `${prefix}-meeting-media-error`);
        await page.locator(".meeting-controls").getByRole("button", { name: "React", exact: true }).click();
        await review.capture(page, `${prefix}-meeting-reactions`);
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: "Minimize meeting", exact: true }).click();
        await review.capture(page, `${prefix}-meeting-small`);
        await panel(page, "Meetings");
        await page.locator(".meeting-card").nth(1).getByRole("button").click();
        await page.locator(".confirmation-dialog").waitFor();
        await review.capture(page, `${prefix}-meeting-switch`);
        await page.locator(".confirmation-dialog").getByRole("button", { name: "Cancel", exact: true }).click();
        await page.getByRole("button", { name: "Close meetings", exact: true }).click();
        await page.getByRole("button", { name: "Expand meeting", exact: true }).click();
        await page.getByRole("button", { name: "Leave meeting", exact: true }).click();
        await page.locator(".meeting-overlay").waitFor({ state: "hidden" });
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
