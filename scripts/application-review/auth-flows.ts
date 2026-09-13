import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createRecorder } from "./capture.js";
import { createReviewFixture } from "./fixture.js";

const review = createRecorder("../../artifacts/application-design-review/after/auth-flows");
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    for (const theme of ["light", "dark"] as const) {
      const fixture = await createReviewFixture(false);
      const context = await browser.newContext({ viewport: { width: width!, height: height! }, colorScheme: theme });
      await fixture.install(context);
      const page = await context.newPage();
      review.observe(page);
      const prefix = `${width}-${theme}`;
      try {
        await page.goto("http://127.0.0.1:5173");
        await page.getByLabel("Username", { exact: true }).fill("review-owner");
        await page.getByLabel("Email", { exact: true }).fill("owner@example.test");
        await page.getByLabel("Password", { exact: true }).fill("Review-password-123");
        await review.capture(page, `${prefix}-owner-setup`);
        await page.getByRole("button", { name: "Create account", exact: true }).click();
        await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
        await page.waitForLoadState("networkidle");
        await review.capture(page, `${prefix}-owner-created`);
        if (!await page.getByRole("button", { name: "Invite member", exact: true }).count()) {
          await page.getByRole("button", { name: "People", exact: true }).click();
        }
        await page.getByRole("button", { name: "Invite member", exact: true }).click();
        await page.locator(".invite-form input[type=email]").fill("guest@example.test");
        await page.locator(".invite-form select").selectOption("guest");
        const invitationResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/invitations"));
        await page.getByRole("button", { name: "Invite", exact: true }).click();
        const invitation = await (await invitationResponse).json() as { inviteLink: string };
        assert(invitation.inviteLink);
        await page.getByRole("button", { name: "Sign out", exact: true }).click();
        await page.getByRole("button", { name: "Email sign-in link", exact: true }).click();
        await page.getByLabel("Email", { exact: true }).fill("owner@example.test");
        await page.getByRole("button", { name: "Send sign-in link", exact: true }).click();
        await page.getByRole("link", { name: "Open sign-in link", exact: true }).waitFor();
        await review.capture(page, `${prefix}-magic-link`);
        await page.getByRole("link", { name: "Open sign-in link", exact: true }).click();
        await page.reload();
        await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
        await review.capture(page, `${prefix}-magic-link-redeemed`);
        await page.getByRole("button", { name: "Sign out", exact: true }).click();
        await page.goto(invitation.inviteLink);
        await page.reload();
        await page.getByLabel("Username", { exact: true }).fill("review-guest");
        await page.getByLabel("Email", { exact: true }).fill("guest@example.test");
        await page.getByLabel("Password", { exact: true }).fill("Review-password-123");
        assert.equal(await page.getByLabel("Invitation code", { exact: true }).count(), 0);
        await review.capture(page, `${prefix}-invitation-registration`);
        await page.getByRole("button", { name: "Create account", exact: true }).click();
        await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
        const guest = fixture.store.getBootstrap(fixture.store.exportMutableState().members.find((member) => member.email === "guest@example.test")!.id);
        assert.equal(guest.members.find((member) => member.id === guest.currentUserId)!.role, "guest");
        await review.capture(page, `${prefix}-guest-created`);
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
