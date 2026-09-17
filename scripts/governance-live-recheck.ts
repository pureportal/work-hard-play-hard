import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Page } from "playwright-core";
import type { BootstrapData, ClientCommand } from "../packages/shared/src/index.js";
import { installWorldProbe } from "./characters/playwright-animation.js";

const output = new URL("../artifacts/governance-recheck/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors: string[] = [];
const checks: string[] = [];
const origin = "http://127.0.0.1:5173";

async function capture(page: Page, name: string) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal overflow`);
  await page.screenshot({ path: new URL(`${name}.png`, output).pathname.replace(/^\/(\w:)/, "$1") });
  await writeFile(new URL(`${name}.txt`, output), await page.locator("body").innerText());
}

try {
  for (const role of ["owner", "admin", "member", "guest"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);
    page.on("pageerror", (error) => errors.push(error.message));
    await installWorldProbe(page);
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.getByRole("textbox", { name: "Username or email" }).fill(role);
    await page.getByLabel("Password", { exact: true }).fill("password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
    await page.waitForFunction(() => Boolean(globalThis.findAvatar("You")));
    const response = await context.request.get(`${origin}/v1/bootstrap`);
    assert.equal(response.status(), 200);
    const data = await response.json() as BootstrapData;
    assert.equal(data.members.find((member) => member.id === data.currentUserId)!.role, role);
    const member = data.members.find((candidate) => candidate.id === data.currentUserId)!;
    const commands: ClientCommand[] = [
      { type: "game.settings_update", requestId: "bypass-game", settings: data.gameSettings },
      { type: "kidnapping.global_settings_update", requestId: "bypass-carrying", settings: data.kidnapping.global },
      { type: "organisation.edit", requestId: "bypass-organisation", baseRevision: data.organisation.revision,
        edit: { type: "ceo.promote", userId: data.currentUserId } },
    ];
    const rejected = await page.evaluate(({ floorId, commands }) => new Promise<string[]>((resolve, reject) => {
      const url = new URL(`/v1/realtime?floorId=${encodeURIComponent(floorId)}`, location.href);
      url.protocol = "ws:";
      const socket = new WebSocket(url);
      const failures: string[] = [];
      const timer = setTimeout(() => { socket.close(); reject(new Error("Permission checks timed out")); }, 15_000);
      socket.addEventListener("message", ({ data }) => {
        const event = JSON.parse(String(data));
        if (event.type === "session.synced") for (const command of commands) socket.send(JSON.stringify(command));
        if (event.type === "command.error" && event.requestId?.startsWith("bypass-")) {
          failures.push(event.code);
          if (failures.length === commands.length) { clearTimeout(timer); socket.close(); resolve(failures); }
        }
      });
    }), { floorId: member.floorId, commands });
    assert.deepEqual(rejected, commands.map(() => "PROJECT_APPROVAL_REQUIRED"));
    await capture(page, `${role}-desktop`);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    if (role === "owner" || role === "admin") {
      await page.getByRole("button", { name: "Server settings", exact: true }).click();
      for (const tab of ["User roles", "Registration", "Appearance", "Spotify"]) {
        await page.getByRole("tab", { name: tab, exact: true }).click();
        if (tab === "Registration") await page.getByRole("checkbox", { name: "Allow registrations", exact: true }).waitFor();
        if (tab === "Appearance") await page.getByRole("tabpanel").getByRole("textbox").first().waitFor();
        if (tab === "Spotify") await page.getByRole("textbox", { name: "Client ID", exact: true }).waitFor();
        await capture(page, `${role}-${tab.toLowerCase().replaceAll(" ", "-")}`);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await capture(page, `${role}-settings-mobile`);
      await page.keyboard.press("Escape");
      await page.setViewportSize({ width: 1440, height: 1000 });
    } else {
      assert.equal(await page.getByRole("button", { name: "Server settings", exact: true }).count(), 0);
      assert.equal((await context.request.get(`${origin}/v1/admin/registration-settings`)).status(), 403);
      assert.equal((await context.request.get(`${origin}/v1/admin/spotify`)).status(), 403);
    }
    await page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("button", { name: "Approvals", exact: true }).click();
    await capture(page, `${role}-approvals`);
    await page.getByRole("button", { name: "Close approvals", exact: true }).click();
    await page.getByRole("button", { name: "Build", exact: true }).click();
    await page.getByRole("tab", { name: "Inventory", exact: true }).waitFor();
    await capture(page, `${role}-build`);
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, `${role}-build-mobile`);
    checks.push(`${role}: real sign-in, server settings access, approvals and build at desktop and mobile sizes; direct gameplay changes rejected by the running server`);
    await context.request.post(`${origin}/v1/auth/logout`);
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await writeFile(new URL("live-result.json", output), JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ checks, errors }, null, 2));
