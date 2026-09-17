import { createServer } from "node:net";
import { mkdir, readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Page } from "puppeteer";
import { createApplication } from "../apps/server/src/app.js";
import { MemoryDatabase } from "../apps/server/src/persistence/memory-database.js";

const distributionDirectory = fileURLToPath(new URL("../apps/client/dist/", import.meta.url));
const indexSource = await readFile(resolve(distributionDirectory, "index.html"));
const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const context = await createApplication({
  database: new MemoryDatabase(),
  clientUrl: origin,
  clientOrigins: [origin],
  exposeMagicLinks: true,
  exposeInvitationLinks: true,
  exposePasswordResetLinks: true,
  exposeRegistrationLinks: true,
});

context.app.get("/*", async (request, reply) => {
  const pathname = new URL(request.url, origin).pathname;
  if (pathname.startsWith("/assets/") || pathname.startsWith("/optimized-images/")) {
    const assetPath = resolve(distributionDirectory, pathname.slice(1));
    const assetDirectory = resolve(distributionDirectory) + sep;
    if (!assetPath.startsWith(assetDirectory)) {
      return reply.code(404).send();
    }
    try {
      return reply.type(contentType(assetPath)).send(await readFile(assetPath));
    } catch {
      return reply.code(404).send();
    }
  }
  return reply.type("text/html; charset=utf-8").send(indexSource);
});

await context.app.listen({ host: "127.0.0.1", port });
const browser = await puppeteer.launch({
  headless: "shell",
  protocolTimeout: 120_000,
  args: ["--disable-gpu"],
});

try {
  const [adminPage] = await browser.pages();
  if (!adminPage) {
    throw new Error("Browser page is missing");
  }
  adminPage.setDefaultTimeout(45_000);
  const recipientContext = await browser.createBrowserContext();
  const recipientPage = await recipientContext.newPage();
  recipientPage.setDefaultTimeout(45_000);

  await adminPage.goto(origin, { waitUntil: "domcontentloaded" });
  await register(adminPage, "owner-e2e", "owner-e2e@example.com", "correct-horse");
  const initialOwner = await adminPage.evaluate(async () => {
    const response = await fetch("/v1/bootstrap", { credentials: "include", cache: "no-store" });
    const bootstrap = await response.json();
    return bootstrap.members.find((member: { id: string }) => member.id === bootstrap.currentUserId);
  }) as { role?: string; permissions?: string[] };
  if (initialOwner.role !== "owner" || !initialOwner.permissions?.includes("manage_members") || !initialOwner.permissions.includes("build")) {
    throw new Error("Initial user did not receive owner permissions");
  }
  report("fresh installation owner created");

  await assertSession(adminPage, "owner-e2e@example.com");
  await adminPage.reload({ waitUntil: "domcontentloaded" });
  await waitForOffice(adminPage);
  report("password session restored");

  await signOut(adminPage);
  await adminPage.evaluate(() => {
    (globalThis as typeof globalThis & { authDocumentMarker?: string }).authDocumentMarker = "same-document";
  });
  await adminPage.click(".auth-utilities .auth-link-button:first-child");
  await adminPage.waitForSelector('input[name="email"]', { visible: true });
  await adminPage.click(".auth-utilities .auth-link-button:first-child");
  await adminPage.waitForSelector('input[name="identifier"]', { visible: true });
  const documentMarker = await adminPage.evaluate(() => (
    globalThis as typeof globalThis & { authDocumentMarker?: string }
  ).authDocumentMarker);
  if (documentMarker !== "same-document") {
    throw new Error("Returning to password sign-in reloaded the page");
  }
  report("email sign-in returned to password sign-in");

  await adminPage.click(".auth-utilities .auth-link-button:first-child");
  await adminPage.type('input[name="email"]', "owner-e2e@example.com");
  await adminPage.click('button[type="submit"]');
  await adminPage.waitForSelector(".auth-email-sent", { visible: true });
  await adminPage.click("a.auth-submit");
  await waitForOffice(adminPage);
  await assertSession(adminPage, "owner-e2e@example.com");
  report("magic-link session ready");

  if (!(await adminPage.$(".people-panel"))) {
    await adminPage.click('button[aria-label="People"]');
    await adminPage.waitForSelector(".people-panel", { visible: true });
  }
  await adminPage.click('button[aria-label="Invite member"]');
  await adminPage.type('.invite-form input[type="email"]', "invite-e2e@example.com");
  const [invitationResponse] = await Promise.all([
    adminPage.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/v1/teams/team/invitations")),
    adminPage.click('.invite-form button[type="submit"]'),
  ]);
  const invitation = await invitationResponse.json() as { id: string; inviteLink?: string };
  if (!invitation.inviteLink) {
    throw new Error("Invitation link is missing");
  }
  const invitationToken = new URLSearchParams(new URL(invitation.inviteLink).hash.slice(1)).get("invite");
  if (!invitationToken) {
    throw new Error("Invitation token is missing");
  }

  await recipientPage.goto(origin, { waitUntil: "domcontentloaded" });
  await signIn(recipientPage, "owner-e2e", "correct-horse");
  await recipientPage.goto(invitation.inviteLink, { waitUntil: "domcontentloaded" });
  await recipientPage.waitForFunction(() => document.querySelector(".error-state h1")?.textContent === "Sign in with the invited email.");
  const hash = await recipientPage.evaluate(() => location.hash);
  if (hash) {
    throw new Error("Invitation token remained in the browser URL");
  }
  await recipientPage.click(".error-state button");
  await recipientPage.waitForSelector(".auth-card", { visible: true });
  report("wrong-account recovery retained invitation");
  await recipientPage.reload({ waitUntil: "domcontentloaded" });
  await recipientPage.waitForSelector(".auth-card", { visible: true });
  await recipientPage.type('input[name="username"]', "invite-e2e");
  await recipientPage.type('input[name="email"]', "invite-e2e@example.com");
  await recipientPage.type('input[name="password"]', "correct-horse");
  await recipientPage.click('button[type="submit"]');
  await waitForOffice(recipientPage);
  await assertSession(recipientPage, "invite-e2e@example.com");
  await recipientPage.reload({ waitUntil: "domcontentloaded" });
  await waitForOffice(recipientPage);

  const replayStatus = await recipientPage.evaluate(async (token) => {
    const response = await fetch("/v1/invitations/accept", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    return response.status;
  }, invitationToken);
  if (replayStatus !== 409) {
    throw new Error(`Invitation replay returned ${replayStatus}`);
  }
  await adminPage.waitForFunction(() => document.body.innerText.includes("invite-e2e"));
  const invitationStatus = await adminPage.evaluate(async (invitationId) => {
    const response = await fetch("/v1/bootstrap", { credentials: "include", cache: "no-store" });
    const bootstrap = await response.json();
    return bootstrap.invitations.find((candidate: { id: string }) => candidate.id === invitationId)?.status;
  }, invitation.id);
  if (invitationStatus !== "accepted") {
    throw new Error("Accepted invitation was not synchronized to the inviter");
  }
  report("invitation accepted once");

  await adminPage.waitForSelector('button[aria-label="invite-e2e"]', { visible: true });
  await adminPage.click('button[aria-label="invite-e2e"]');
  const [accessResponse] = await Promise.all([
    adminPage.waitForResponse((response) => response.request().method() === "PATCH" && response.url().includes("/members/")),
    adminPage.locator('.person-row-wrap.expanded .permission-toggle input[type="checkbox"]').click(),
  ]);
  if (accessResponse.status() !== 200) {
    throw new Error("Build permission assignment failed");
  }
  await adminPage.waitForFunction(() => (document.querySelector('.person-row-wrap.expanded .permission-toggle input[type="checkbox"]') as HTMLInputElement | null)?.checked === true);
  await recipientPage.waitForSelector('button[aria-label="Build"]', { visible: true });
  await recipientPage.click('button[aria-label="Build"]');
  await recipientPage.waitForSelector(".build-panel", { visible: true });
  report("member build permission granted");

  const [revokeAccessResponse] = await Promise.all([
    adminPage.waitForResponse((response) => response.request().method() === "PATCH" && response.url().includes("/members/")),
    adminPage.locator('.person-row-wrap.expanded .permission-toggle input[type="checkbox"]').click(),
  ]);
  if (revokeAccessResponse.status() !== 200) {
    throw new Error("Build permission revocation failed");
  }
  await recipientPage.waitForFunction(() => (
    !document.querySelector(".build-panel:not(.player-build-panel)")
    && Boolean(document.querySelector(".player-build-panel"))
  ));
  report("member office build permission revoked");

  const artifactDirectory = fileURLToPath(new URL("../artifacts/auth-review/", import.meta.url));
  await mkdir(artifactDirectory, { recursive: true });
  const recoveryContext = await browser.createBrowserContext();
  const recoveryPage = await recoveryContext.newPage();
  recoveryPage.setDefaultTimeout(45_000);
  await recoveryPage.setViewport({ width: 390, height: 844 });
  await recoveryPage.goto(origin, { waitUntil: "domcontentloaded" });
  await recoveryPage.locator('button::-p-text(Forgot password?)').click();
  await recoveryPage.waitForSelector('input[name="email"]', { visible: true });
  await recoveryPage.screenshot({ path: resolve(artifactDirectory, "forgot-password-mobile.png") });
  await recoveryPage.type('input[name="email"]', "invite-e2e@example.com");
  await recoveryPage.click('button[type="submit"]');
  await recoveryPage.waitForSelector('a.auth-submit', { visible: true });
  const resetLink = await recoveryPage.$eval('a.auth-submit', (element) => (element as HTMLAnchorElement).href);
  const resetToken = new URLSearchParams(new URL(resetLink).hash.slice(1)).get("reset")!;
  await recoveryPage.goto(resetLink, { waitUntil: "domcontentloaded" });
  await recoveryPage.waitForSelector('#reset-password', { visible: true });
  if (new URL(recoveryPage.url()).hash) throw new Error("Reset token remained in the browser URL");
  await recoveryPage.reload({ waitUntil: "domcontentloaded" });
  await recoveryPage.waitForSelector('#reset-password', { visible: true });
  await recoveryPage.screenshot({ path: resolve(artifactDirectory, "reset-password-mobile.png") });
  await recoveryPage.type('#reset-password', "replacement-password");
  await recoveryPage.type('#confirm-password', "replacement-password");
  await recoveryPage.click('button[type="submit"]');
  await recoveryPage.waitForFunction(() => document.body.innerText.includes("Password changed"));
  await recipientPage.waitForSelector('.auth-card', { visible: true });
  const resetSession = await recoveryPage.evaluate(async () => (await (await fetch("/v1/auth/session")).json()).user);
  if (resetSession !== null) throw new Error("Password reset automatically signed in");
  const resetReplay = await recoveryPage.evaluate(async (token) => (await fetch("/v1/auth/reset-password", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password: "replayed-password" }),
  })).status, resetToken);
  if (resetReplay !== 401) throw new Error(`Reset replay returned ${resetReplay}`);
  await recoveryPage.locator('button::-p-text(Back to sign in)').click();
  await signIn(recoveryPage, "invite-e2e", "replacement-password");
  report("password recovery revoked active sessions and rejected replay");
  await signOut(recoveryPage);
  report("logout returned to authentication");

  context.store.updateRegistrationSettings({ enabled: true, invitationRequired: false, whitelistedDomains: [], defaultRole: "member" });
  await recoveryPage.reload({ waitUntil: "domcontentloaded" });
  await recoveryPage.waitForSelector('#auth-register-tab', { visible: true });
  await recoveryPage.click('#auth-register-tab');
  await recoveryPage.type('input[name="username"]', "verified-e2e");
  await recoveryPage.type('input[name="email"]', "verified-e2e@example.com");
  await recoveryPage.type('input[name="password"]', "verified-password");
  await recoveryPage.click('button[type="submit"]');
  await recoveryPage.waitForFunction(() => document.body.innerText.includes("Verify your email"));
  const pendingSession = await recoveryPage.evaluate(async () => (await (await fetch("/v1/auth/session")).json()).user);
  if (pendingSession !== null) throw new Error("Registration signed in before email verification");
  await recoveryPage.screenshot({ path: resolve(artifactDirectory, "registration-verification-mobile.png") });
  await recoveryPage.click('a.auth-submit');
  await waitForOffice(recoveryPage);
  await assertSession(recoveryPage, "verified-e2e@example.com");
  report("public registration required email verification");
  await signOut(recoveryPage);
  await recoveryPage.goto(`${origin}/auth/register#registration=${"x".repeat(43)}`, { waitUntil: "domcontentloaded" });
  await recoveryPage.waitForSelector('.auth-error', { visible: true });
  await recoveryPage.waitForSelector('#auth-register-tab', { visible: true });
  await recoveryPage.locator('button::-p-text(Forgot password?)').wait();
  report("invalid email links preserved account recovery actions");
} catch (error) {
  const failureDirectory = fileURLToPath(new URL("../artifacts/auth-review/", import.meta.url));
  await mkdir(failureDirectory, { recursive: true });
  for (const [index, page] of (await browser.pages()).entries()) {
    await page.screenshot({ path: resolve(failureDirectory, `failure-${index}.png`) });
    console.error(`Browser ${index}: ${await page.evaluate(() => document.body.innerText.slice(0, 2000))}`);
  }
  throw error;
} finally {
  const closed = await Promise.race([
    browser.close().then(() => true).catch(() => false),
    new Promise<boolean>((resolvePromise) => setTimeout(() => resolvePromise(false), 3_000)),
  ]);
  if (!closed) {
    browser.process()?.kill();
  }
  await context.app.close();
}

async function signIn(page: Page, identifier: string, password: string): Promise<void> {
  await page.waitForSelector(".auth-card", { visible: true });
  await page.type('input[name="identifier"]', identifier);
  await page.type('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await waitForOffice(page);
}

async function register(page: Page, username: string, email: string, password: string): Promise<void> {
  await page.waitForSelector(".auth-card", { visible: true });
  await page.type('input[name="username"]', username);
  await page.type('input[name="email"]', email);
  await page.type('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await waitForOffice(page);
}

async function signOut(page: Page): Promise<void> {
  await page.click('button[aria-label="Sign out"]');
  await page.waitForSelector(".auth-card", { visible: true });
}

async function waitForOffice(page: Page): Promise<void> {
  await page.waitForSelector(".world-canvas canvas", { visible: true });
  await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
}

async function assertSession(page: Page, email: string): Promise<void> {
  const sessionEmail = await page.evaluate(async () => {
    const response = await fetch("/v1/auth/session", { credentials: "include", cache: "no-store" });
    return (await response.json()).user?.email;
  });
  if (sessionEmail !== email) {
    throw new Error(`Expected session for ${email}`);
  }
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Test port is unavailable");
  }
  await new Promise<void>((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
  return address.port;
}

function contentType(path: string): string {
  const types: Record<string, string> = {
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };
  return types[extname(path)] ?? "application/octet-stream";
}

function report(message: string): void {
  process.stdout.write(`${message}\n`);
}
