import { createServer } from "node:net";
import { readFile } from "node:fs/promises";
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
});

context.app.get("/*", async (request, reply) => {
  const pathname = new URL(request.url, origin).pathname;
  if (pathname.startsWith("/assets/")) {
    const assetPath = resolve(distributionDirectory, pathname.slice(1));
    const assetDirectory = resolve(distributionDirectory, "assets") + sep;
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
  adminPage.setDefaultTimeout(15_000);
  const recipientContext = await browser.createBrowserContext();
  const recipientPage = await recipientContext.newPage();
  recipientPage.setDefaultTimeout(15_000);

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
  await adminPage.click(".auth-link-button");
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
  const invitationResponse = adminPage.waitForResponse((response) =>
    response.request().method() === "POST" && response.url().endsWith("/v1/teams/team-northstar/invitations"),
  );
  await adminPage.click('.invite-form button[type="submit"]');
  const invitation = await (await invitationResponse).json() as { id: string; inviteLink?: string };
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
  const accessResponse = adminPage.waitForResponse((response) =>
    response.request().method() === "PATCH" && response.url().includes("/members/"),
  );
  await adminPage.click('.person-row-wrap.expanded .permission-toggle input[type="checkbox"]');
  if ((await accessResponse).status() !== 200) {
    throw new Error("Build permission assignment failed");
  }
  await adminPage.waitForFunction(() => (document.querySelector('.person-row-wrap.expanded .permission-toggle input[type="checkbox"]') as HTMLInputElement | null)?.checked === true);
  await recipientPage.waitForSelector('button[aria-label="Build"]', { visible: true });
  await recipientPage.click('button[aria-label="Build"]');
  await recipientPage.waitForSelector(".build-panel", { visible: true });
  report("member build permission granted");

  const revokeAccessResponse = adminPage.waitForResponse((response) =>
    response.request().method() === "PATCH" && response.url().includes("/members/"),
  );
  await adminPage.click('.person-row-wrap.expanded .permission-toggle input[type="checkbox"]');
  if ((await revokeAccessResponse).status() !== 200) {
    throw new Error("Build permission revocation failed");
  }
  await recipientPage.waitForFunction(() => (
    !document.querySelector(".build-panel:not(.player-build-panel)")
    && Boolean(document.querySelector(".player-build-panel"))
  ));
  report("member office build permission revoked");

  await signOut(recipientPage);
  report("logout returned to authentication");
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
    ".svg": "image/svg+xml",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };
  return types[extname(path)] ?? "application/octet-stream";
}

function report(message: string): void {
  process.stdout.write(`${message}\n`);
}
