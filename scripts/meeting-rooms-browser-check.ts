import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";
import { isPointInRoom } from "../packages/shared/src/index.js";
import { createTestApplication } from "../apps/server/src/testing/application.js";

const output = fileURLToPath(new URL("../artifacts/meeting-rooms/", import.meta.url));
const distribution = resolve(output, "client");
await mkdir(output, { recursive: true });
const port = await new Promise<number>((resolvePort, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const selected = (probe.address() as AddressInfo).port;
    probe.close(() => resolvePort(selected));
  });
});
const origin = `http://127.0.0.1:${port}`;
const application = await createTestApplication({ fixture: true, clientUrl: origin, clientOrigins: [origin] });
application.store.getOrganisation().ceoIds = ["user-maya"];
const player = application.store.getMember("user-maya")!;
const room = application.store.getLayout(player.floorId!)!.rooms.find((candidate) => isPointInRoom(player.position!.x, player.position!.y, candidate))!;
assert(room);
const roomName = room.name;
const title = "Team call";
await application.app.listen({ host: "127.0.0.1", port });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors: string[] = [];
const checks: string[] = [];

async function login(identifier: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light", permissions: ["local-network-access"] });
  await context.addInitScript(() => { localStorage.setItem("northstar.serverOrigin", location.origin); });
  await context.route(`${origin}/**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.startsWith("/v1/")) { await route.continue(); return; }
    const file = resolve(distribution, pathname === "/" ? "index.html" : `.${decodeURIComponent(pathname)}`);
    assert(file.startsWith(distribution + sep));
    const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml", ".json": "application/json" };
    await route.fulfill({ body: await readFile(file), contentType: types[extname(file)] ?? "application/octet-stream" });
  });
  const response = await context.request.post(`${origin}/v1/auth/login`, { data: { identifier, password: "northstar" } });
  assert.equal(response.status(), 200);
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("websocket", (socket) => socket.on("socketerror", (error) => errors.push(error)));
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
  return page;
}

async function openRoomSettings(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("button", { name: "Build", exact: true }).click();
  await page.getByRole("button", { name: "Room settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Room settings", exact: true });
  await dialog.getByRole("button", { name, exact: true }).click();
  return dialog;
}

async function applyProposal(page: Page) {
  await page.getByRole("button", { name: "Propose changes", exact: true }).click();
  const proposal = page.getByRole("article", { name: `Update ${title}`, exact: true });
  await proposal.getByRole("button", { name: "Apply proposal", exact: true }).click();
  await proposal.getByRole("button", { name: "Apply proposal", exact: true }).waitFor({ state: "hidden" });
  await page.getByRole("dialog").getByRole("button", { name: "Close funds & votes", exact: true }).click();
}

try {
  const maya = await login("maya");
  const settings = await openRoomSettings(maya, roomName);
  await settings.getByRole("textbox", { name: "Name", exact: true }).fill(title);
  await settings.getByRole("checkbox", { name: "Meeting room", exact: true }).check();
  await maya.screenshot({ path: resolve(output, "room-settings-desktop.png") });
  await maya.setViewportSize({ width: 390, height: 844 });
  assert(await settings.getByRole("checkbox", { name: "Meeting room", exact: true }).isVisible());
  assert(await maya.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await maya.screenshot({ path: resolve(output, "room-settings-mobile.png") });
  await maya.setViewportSize({ width: 1440, height: 1000 });
  await applyProposal(maya);
  assert.equal(application.store.getRoom(room.id)?.meetingRoom, true);
  checks.push("Desktop and mobile room settings submit and apply the meeting-room proposal");

  await maya.getByRole("button", { name: "Meetings", exact: true }).click();
  const card = maya.getByRole("article").filter({ has: maya.getByRole("heading", { name: title, exact: true }) });
  assert.equal(await card.locator("time").count(), 0);
  await card.getByRole("button", { name: "Start", exact: true }).click();
  const call = maya.getByRole("dialog", { name: title, exact: true });
  await call.waitFor();
  await call.getByRole("textbox", { name: "Meeting message" }).fill("Browser room call message");
  await call.getByRole("button", { name: "Send meeting message" }).click();
  await call.getByRole("log").getByText("Browser room call message", { exact: false }).waitFor();
  await maya.screenshot({ path: resolve(output, "room-call-desktop.png") });
  await call.getByRole("button", { name: "Leave meeting" }).click();
  await call.waitFor({ state: "hidden" });
  checks.push("Meetings starts the room call, meeting chat works, and leaving makes the room available again");

  const panel = maya.getByRole("complementary", { name: "Meetings", exact: true });
  if (await panel.isVisible()) await panel.getByRole("button", { name: "Close meetings", exact: true }).click();
  await maya.getByRole("region", { name: `${title} meeting`, exact: true }).getByRole("button", { name: "Open Small", exact: true }).click();
  await call.waitFor();
  assert((await call.getAttribute("class"))?.includes("meeting-overlay-small"));
  await call.getByRole("button", { name: "Leave meeting" }).click();
  await call.waitFor({ state: "hidden" });
  checks.push("Room entry offers the idle meeting and opens it in the small view");

  const leo = await login("leo");
  await leo.getByRole("button", { name: "Meetings", exact: true }).click();
  const guestCard = leo.getByRole("article").filter({ has: leo.getByRole("heading", { name: title, exact: true }) });
  await guestCard.getByRole("button", { name: "Start", exact: true }).click();
  const guestCall = leo.getByRole("dialog", { name: title, exact: true });
  await guestCall.waitFor();
  await maya.reload();
  await maya.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
  const reopened = await openRoomSettings(maya, title);
  assert(await reopened.getByRole("checkbox", { name: "Meeting room", exact: true }).isChecked());
  await reopened.getByRole("checkbox", { name: "Meeting room", exact: true }).uncheck();
  await reopened.getByText("Turning this off ends the room call.", { exact: true }).waitFor();
  await applyProposal(maya);
  await guestCall.waitFor({ state: "hidden" });
  await leo.getByRole("button", { name: "Meetings", exact: true }).click();
  assert.equal(await guestCard.count(), 0);
  checks.push("The setting survives reload; disabling it removes the call and disconnects a remote participant");
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, "report.json"), JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  const pages = browser.contexts().flatMap((context) => context.pages());
  await writeFile(resolve(output, "failure.json"), JSON.stringify({ checks, errors,
    pages: await Promise.all(pages.map(async (page, index) => {
      await page.screenshot({ path: resolve(output, `failure-${index}.png`) });
      return { url: page.url(), text: await page.locator("body").innerText() };
    })),
  }, null, 2));
  throw error;
} finally {
  await browser.close();
  await application.app.close();
}
