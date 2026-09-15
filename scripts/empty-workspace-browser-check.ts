import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import type { BootstrapData } from "../packages/shared/src/index.js";
import { startWorkspaceBrowserFixture } from "./workspace-browser-fixture.js";

const fixture = await startWorkspaceBrowserFixture();
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const errors: string[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(fixture.origin);
  await page.getByLabel("Username", { exact: true }).fill("workspace-owner");
  await page.getByLabel("Email", { exact: true }).fill("workspace-owner@example.test");
  await page.getByLabel("Password", { exact: true }).fill("workspace-check-password");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.locator(".world-canvas canvas").waitFor({ timeout: 60_000 });
  const data = await (await page.request.get(`${fixture.origin}/v1/bootstrap`)).json() as BootstrapData;
  assert.equal(data.members.length, 1);
  assert.equal(data.members[0]!.name, "workspace-owner");
  assert.equal(data.floors.length, 1);
  for (const records of [data.messages, data.meetings, data.invitations, data.scores, data.organisation.units]) assert.deepEqual(records, []);
  assert.equal(data.layouts[0]!.rooms.length, 1);
  assert(data.layouts[0]!.rooms.every((room) => room.access.mode === "open" && !room.organisationUnitId));
  const wallCount = data.layouts[0]!.walls.length;
  await page.getByRole("button", { name: "People", exact: true }).click();
  assert(!/Maya Chen|Jonas Berg|Product crit|September planning/.test(await page.locator("body").innerText()));
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.getByRole("button", { name: "Wall", exact: true }).waitFor();
  const canvas = await page.locator(".world-canvas canvas").boundingBox();
  assert(canvas);
  await page.getByRole("button", { name: "Wall", exact: true }).click();
  await page.mouse.click(canvas.x + canvas.width * 0.4, canvas.y + canvas.height * 0.4);
  await page.mouse.move(canvas.x + canvas.width * 0.55, canvas.y + canvas.height * 0.4, { steps: 8 });
  await page.mouse.click(canvas.x + canvas.width * 0.55, canvas.y + canvas.height * 0.4);
  const deadline = Date.now() + 15_000;
  while (fixture.application.store.getLayout(data.floors[0]!.id)!.walls.length === wallCount && Date.now() < deadline) {
    await page.waitForTimeout(100);
  }
  assert(fixture.application.store.getLayout(data.floors[0]!.id)!.walls.length > wallCount, "The wall was saved by the server");
  await page.reload();
  await page.locator(".world-canvas canvas").waitFor();
  const saved = await (await page.request.get(`${fixture.origin}/v1/bootstrap`)).json() as BootstrapData;
  assert(saved.layouts[0]!.walls.length > wallCount);
  assert.equal(saved.members.length, 1);
  const artifacts = new URL("../artifacts/demo-cleanup/", import.meta.url);
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL("empty-workspace.png", artifacts)) });
  assert.deepEqual(errors, []);
  process.stdout.write("Empty workspace registration, directory, building and reload passed.\n");
} finally {
  await browser.close();
  await fixture.close();
}
