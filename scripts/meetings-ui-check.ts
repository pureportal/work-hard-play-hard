import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser } from "playwright-core";
import type { WorldObject } from "../packages/shared/src/index.js";
import type { WorkspaceStore } from "../apps/server/src/store.js";

declare global {
  var meetingUiCaptures: MediaStream[];
}

export async function verifyMeetingUi(browser: Browser, store: WorkspaceStore, origin: string): Promise<string[]> {
  const position = store.getMember("user-maya")!.position!;
  const meeting = store.getMeeting("meeting-product-crit")!;
  const room = store.getLayout("floor-studio")!.rooms.find((candidate) => candidate.footprint.some((bounds) => position.x >= bounds.x && position.x <= bounds.x + bounds.width && position.y >= bounds.y && position.y <= bounds.y + bounds.height))!;
  meeting.location = { type: "room", roomId: room.id };
  const board: WorldObject = { id: "meeting-browser-board", floorId: "floor-studio", assetId: "equipment-whiteboard", variantId: "graphite",
    x: position.x + 64, y: position.y - 16, rotation: 0, label: "Meeting board",
    workState: { kind: "whiteboard", revision: 0, document: { text: "Agenda", cards: [] } } };
  store.getLayout("floor-studio")!.objects.push(board);
  for (let index = 0; index < 36; index++) store.addMessage("conversation-daily", "user-maya", `Discussion ${index + 1}`);

  const distribution = process.env.MEETINGS_CLIENT_DIST
    ? resolve(process.env.MEETINGS_CLIENT_DIST)
    : fileURLToPath(new URL("../apps/client/dist/", import.meta.url));
  const artifacts = fileURLToPath(new URL("../artifacts/meetings/", import.meta.url));
  await mkdir(artifacts, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ["local-network-access"] });
  const errors: string[] = [];
  const events: string[] = [];
  try {
    await context.addInitScript(() => {
      localStorage.setItem("northstar.serverOrigin", location.origin);
      globalThis.meetingUiCaptures = [];
      navigator.mediaDevices.getDisplayMedia = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 1280;
        canvas.height = 720;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "#415c78";
        context.fillRect(0, 0, canvas.width, canvas.height);
        return canvas.captureStream(5);
      };
      const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = (constraints) => capture(constraints).then((stream) => {
        globalThis.meetingUiCaptures.push(stream);
        return stream;
      });
    });
    await context.route(`${origin}/**`, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.startsWith("/v1/")) { await route.continue(); return; }
      const file = resolve(distribution, pathname === "/" ? "index.html" : `.${decodeURIComponent(pathname)}`);
      assert(file.startsWith(resolve(distribution) + sep));
      const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };
      await route.fulfill({ body: await readFile(file), contentType: types[extname(file)] ?? "application/octet-stream" });
    });
    const response = await context.request.post(`${origin}/v1/auth/login`, { data: { identifier: "maya", password: "northstar" } });
    assert.equal(response.status(), 200);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("websocket", (socket) => {
      socket.on("framereceived", (frame) => { if (events.length < 40) events.push((JSON.parse(String(frame.payload)) as { type: string }).type); });
      socket.on("close", () => events.push("socket.closed"));
      socket.on("socketerror", (error) => errors.push(error));
    });
    page.setDefaultTimeout(15_000);
    await page.goto(origin);
    await page.locator(".world-canvas canvas").waitFor();
    await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
    const dailyBonus = page.getByRole("dialog", { name: "Daily bonus" });
    if (await dailyBonus.count()) await dailyBonus.getByRole("button", { name: "Close daily bonus" }).click();
    const skipGuide = page.locator(".game-guide-tooltip .guide-skip");
    await skipGuide.waitFor();
    await skipGuide.click();
    const closeBuild = page.getByRole("button", { name: "Close build tools" });
    if (await closeBuild.count()) await closeBuild.click();
    assert.equal(await page.getByRole("dialog", { name: "Product crit", exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => globalThis.meetingUiCaptures.length), 0);
    await page.getByRole("region", { name: "Product crit meeting" }).getByRole("button", { name: "Open", exact: true }).click();
    const call = page.getByRole("dialog", { name: "Product crit", exact: true });
    await call.waitFor();
    assert.equal(await page.evaluate(() => globalThis.meetingUiCaptures.length), 0);
    await call.getByRole("button", { name: "Unmute", exact: true }).click();
    await call.getByText("Microphone blocked. Allow access in your browser and try again.").waitFor();
    await call.getByRole("button", { name: "Turn camera on", exact: true }).click();
    await call.getByText("Camera blocked. Allow access in your browser and try again.").waitFor();
    await context.grantPermissions(["microphone", "camera", "local-network-access"]);
    await call.getByRole("button", { name: "Unmute", exact: true }).click();
    await page.waitForFunction(() => globalThis.meetingUiCaptures.some((stream) => stream.getAudioTracks().some((track) => track.readyState === "live")));
    await page.screenshot({ path: resolve(artifacts, "meeting-desktop.png") });

    const desktopBounds = await call.boundingBox();
    assert(desktopBounds && desktopBounds.width > 1300 && desktopBounds.height > 900, "Expanded meeting must use the viewport");
    await call.getByRole("button", { name: "Focus Leo Martins" }).click();
    assert.equal(await call.locator(".call-stage-primary footer strong").innerText(), "Leo Martins");
    await call.getByRole("button", { name: "Focus You" }).click();
    assert.equal(await call.locator(".call-stage-primary footer strong").innerText(), "You");
    await call.getByRole("button", { name: "Show gallery" }).click();
    assert.equal(await call.locator(".call-stage-primary").count(), 0);
    const stageWithChat = (await call.locator(".meeting-stage").boundingBox())!.width;
    await call.getByRole("button", { name: "Hide chat" }).click();
    assert((await call.locator(".meeting-stage").boundingBox())!.width > stageWithChat + 200);
    await call.getByRole("button", { name: "Show chat" }).click();
    await call.getByRole("button", { name: "Share screen or window" }).click();
    await call.getByRole("button", { name: "Show gallery" }).waitFor();
    assert.equal(await call.locator(".call-stage-primary footer strong").innerText(), "Your screen");
    await page.screenshot({ path: resolve(artifacts, "meeting-screen-focus.png") });
    await call.getByRole("button", { name: "Stop sharing" }).click();
    await call.getByRole("button", { name: "Enter fullscreen" }).click();
    await page.waitForFunction(() => document.fullscreenElement?.classList.contains("meeting-overlay"));
    assert.equal(await call.getByRole("button", { name: "Exit fullscreen" }).count(), 1);
    await page.screenshot({ path: resolve(artifacts, "meeting-fullscreen.png") });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.fullscreenElement);
    assert(await call.isVisible());
    for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(size);
      await call.getByRole("button", { name: "Focus Leo Martins" }).click();
      const primary = await call.locator(".call-stage-primary").boundingBox();
      const filmstrip = await call.locator(".call-stage-filmstrip").boundingBox();
      assert(primary && filmstrip && filmstrip.y >= primary.y + primary.height - 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: resolve(artifacts, `meeting-focused-${size.width}.png`) });
      await call.getByRole("button", { name: "Show gallery" }).click();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });

    await call.getByRole("log").evaluate((element) => { element.scrollTop = 0; element.dispatchEvent(new Event("scroll")); });
    await call.getByRole("button", { name: "Jump to latest" }).waitFor();
    await call.getByRole("textbox", { name: "Meeting message" }).fill("Reply from browser");
    await call.getByRole("button", { name: "Send meeting message" }).click();
    await call.getByText("Reply from browser", { exact: false }).waitFor();
    await call.getByRole("button", { name: "Jump to latest" }).waitFor({ state: "hidden" });
    assert(await call.getByRole("log").evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight < 48));

    await call.getByRole("button", { name: "Meeting settings" }).click();
    assert.equal(await call.getByRole("checkbox", { name: "Noise filtering" }).isChecked(), true);
    await call.getByRole("button", { name: "Meeting board" }).click();
    const whiteboard = page.getByRole("dialog", { name: "Meeting board", exact: true });
    await whiteboard.waitFor();
    assert.equal(await whiteboard.getAttribute("aria-modal"), null);
    assert((await call.getAttribute("class"))?.includes("meeting-overlay-small"));
    await whiteboard.getByRole("textbox", { name: "Notes", exact: true }).fill("Agreed during the meeting");
    await whiteboard.getByRole("status").filter({ hasText: /^Saved$/ }).waitFor();
    const saved = store.getLayout("floor-studio")!.objects.find((object) => object.id === board.id)!.workState;
    assert.equal(saved?.kind === "whiteboard" && saved.document.text, "Agreed during the meeting");
    assert.equal(await page.evaluate(() => globalThis.meetingUiCaptures.length), 1);
    await page.screenshot({ path: resolve(artifacts, "meeting-board-desktop.png") });

    for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(size);
      const boardBounds = await whiteboard.boundingBox();
      const callBounds = await call.boundingBox();
      assert(boardBounds && callBounds);
      assert(boardBounds.y + boardBounds.height <= callBounds.y + 1, "The board must leave meeting controls visible");
      const notes = await whiteboard.getByRole("textbox", { name: "Notes", exact: true }).boundingBox();
      assert(notes && notes.height >= 64, "The board must leave space to edit notes");
      for (const label of ["Expand meeting", "Mute", "Leave meeting"]) {
        const button = call.getByRole("button", { name: label, exact: true });
        const bounds = await button.boundingBox();
        assert(bounds && bounds.x >= callBounds.x && bounds.x + bounds.width <= callBounds.x + callBounds.width + 1,
          `${label} must fit inside the meeting`);
        assert(await button.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)?.closest("button") === element;
        }), `${label} must remain reachable`);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await call.getByRole("button", { name: "React", exact: true }).click();
      await call.getByRole("group", { name: "Reactions" }).evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)).then(() => undefined));
      for (const button of await call.getByRole("group", { name: "Reactions" }).getByRole("button").all()) {
        assert(await button.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)?.closest("button") === element;
        }), "Every meeting reaction must remain reachable");
      }
      await page.keyboard.press("Escape");
      await page.screenshot({ path: resolve(artifacts, `meeting-board-${size.width}.png`) });
    }
    await call.getByRole("button", { name: "Meeting settings" }).click();
    assert(!(await call.getAttribute("class"))?.includes("meeting-overlay-small"));
    await call.getByRole("combobox", { name: "Microphone", exact: true }).waitFor();
    await call.getByRole("button", { name: "Minimize meeting" }).click();
    await whiteboard.getByRole("button", { name: "Close board" }).click();
    await call.getByRole("button", { name: "Leave meeting", exact: true }).click();
    await call.waitFor({ state: "hidden" });
    await page.waitForFunction(() => globalThis.meetingUiCaptures.every((stream) => stream.getTracks().every((track) => track.readyState === "ended")));
    assert.deepEqual(errors, []);
    return ["Built UI requires Open, recovers from denied microphone/camera permissions, and stops capture after leaving",
      "Chat jumps after sending; a saved whiteboard remains usable beside the meeting on desktop and mobile without restarting capture"];
  } catch (error) {
    const page = context.pages()[0];
    if (page) {
      await page.screenshot({ path: resolve(artifacts, "meeting-ui-failure.png") });
      console.error(JSON.stringify({ errors, events, content: (await page.locator("body").innerText()).slice(0, 1500) }, null, 2));
    }
    throw error;
  } finally {
    await context.close();
  }
}
