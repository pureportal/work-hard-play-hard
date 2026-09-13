import { chromium } from "playwright-core";
import { createRecorder } from "./capture.js";
import { createReviewFixture } from "./fixture.js";

const review = createRecorder(`../../artifacts/application-design-review/${process.env.REVIEW_PHASE ?? "before"}/auth`);
const browser = await chromium.launch({ channel: "msedge", headless: true });

try {
  for (const [width, height] of [[1440, 1000], [390, 844], [320, 568], [844, 390]]) {
    for (const theme of ["light", "dark"] as const) {
      const fixture = await createReviewFixture();
      fixture.store.updateRegistrationSettings({ enabled: true, invitationRequired: true, defaultRole: "member", whitelistedDomains: [] });
      const context = await browser.newContext({ viewport: { width: width!, height: height! }, colorScheme: theme });
      await fixture.install(context);
      const page = await context.newPage();
      review.observe(page);
      const prefix = `${width}-${theme}`;
      try {
        await page.goto("http://127.0.0.1:5173");
        await page.getByLabel("Username or email").waitFor();
        await review.capture(page, `${prefix}-login`);
        await page.getByRole("button", { name: "Show password" }).click();
        await page.getByRole("button", { name: "Hide password" }).click();
        await page.getByLabel("Username or email").fill("maya");
        await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
        await page.getByRole("button", { name: "Sign in", exact: true }).click();
        await page.getByRole("alert").waitFor();
        await review.capture(page, `${prefix}-invalid-login`);
        await page.getByRole("tab", { name: "Create account", exact: true }).click();
        await review.capture(page, `${prefix}-registration`);
        await page.getByRole("button", { name: "Server", exact: true }).click();
        await review.capture(page, `${prefix}-registration-server`);
        await page.getByLabel("Server URL").fill("ftp://example.test");
        await page.getByRole("button", { name: "Connect", exact: true }).click();
        await page.getByRole("alert").waitFor();
        await review.capture(page, `${prefix}-server-validation`);
        await page.getByRole("button", { name: "Server", exact: true }).click();
        await page.getByRole("tab", { name: "Sign in", exact: true }).click();
        await page.getByRole("button", { name: "Email sign-in link", exact: true }).click();
        await review.capture(page, `${prefix}-email`);
        await page.getByLabel("Email", { exact: true }).fill("absent@example.test");
        await page.getByRole("button", { name: "Send sign-in link", exact: true }).click();
        await page.getByRole("heading", { name: "Check your email" }).waitFor();
        await review.capture(page, `${prefix}-email-sent`);
        fixture.store.updateCorporateIdentity({ ...fixture.store.getCorporateIdentity(), authenticationLayout: "centered" });
        await page.reload();
        await page.getByLabel("Username or email").waitFor();
        await review.capture(page, `${prefix}-centered`);
        fixture.store.updateRegistrationSettings({ enabled: false, invitationRequired: true, defaultRole: "member", whitelistedDomains: [] });
        await page.reload();
        await page.getByLabel("Username or email").waitFor();
        await review.capture(page, `${prefix}-registration-disabled`);
        await page.route("**/v1/auth/session", async (route) => { await route.fulfill({ status: 503, json: { message: "Office unavailable. Try again." } }); });
        await page.reload();
        await page.locator(".error-state").waitFor();
        await review.capture(page, `${prefix}-connection-error`);
        await page.unroute("**/v1/auth/session");
        await page.getByRole("button", { name: "Retry", exact: true }).click();
        await page.getByLabel("Username or email").waitFor();
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
  const fixture = await createReviewFixture(false);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await fixture.install(context);
  const page = await context.newPage();
  review.observe(page);
  await page.goto("http://127.0.0.1:5173");
  await page.getByLabel("Username", { exact: true }).waitFor();
  await review.capture(page, "390-first-owner-setup");
  await context.close();
  await fixture.stop();
} finally {
  await browser.close();
  await review.save();
}
