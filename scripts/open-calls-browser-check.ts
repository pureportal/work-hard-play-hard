import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type AddressInfo } from "node:net";
import { chromium, type Page } from "playwright-core";
import { createTestApplication } from "../apps/server/src/testing/application.js";
import { MemoryDatabase } from "../apps/server/src/persistence/memory-database.js";
import { verifyCallDeviceChanges, verifyMeetingDeviceChanges } from "./call-devices-browser-check.js";
import { verifyCallRecovery } from "./call-recovery-browser-check.js";

declare global {
  var openCallCaptures: MediaStream[];
  var openCallPeers: RTCPeerConnection[];
  var openCallSocket: WebSocket;
  var openCallDevices: { microphone: "available" | "missing" | "blocked"; camera: "available" | "missing" | "blocked" };
  var openCallCaptureRequests: MediaStreamConstraints[];
}

const port = await new Promise<number>((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const selected = (probe.address() as AddressInfo).port;
    probe.close(() => resolve(selected));
  });
});
const origin = `http://127.0.0.1:${port}`;
const application = await createTestApplication({ database: new MemoryDatabase(), fixture: true, clientUrl: origin, clientOrigins: [origin] });
application.runtime.restorePlayers(application.runtime.serializePlayers().map((player) => {
  const positions: Record<string, { x: number; y: number }> = { "user-maya": { x: 100, y: 100 }, "user-leo": { x: 160, y: 100 }, "user-theo": { x: 150, y: 175 } };
  return { ...player, ...positions[player.userId] };
}));
await application.app.listen({ host: "127.0.0.1", port });
const distribution = fileURLToPath(new URL("../artifacts/open-calls/client/", import.meta.url));
const artifacts = fileURLToPath(new URL("../artifacts/open-calls/", import.meta.url));
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const errors: string[] = [];

async function login(identifier: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ["microphone", "camera", "local-network-access"] });
  await context.addInitScript(() => {
    localStorage.setItem("northstar.serverOrigin", location.origin);
    globalThis.openCallCaptures = [];
    globalThis.openCallPeers = [];
    globalThis.openCallDevices = { microphone: "available", camera: "available" };
    globalThis.openCallCaptureRequests = [];
    const enumerate = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    navigator.mediaDevices.enumerateDevices = async () => (await enumerate()).filter((device) =>
      device.kind === "audioinput" ? openCallDevices.microphone === "available" : device.kind === "videoinput" ? openCallDevices.camera === "available" : true);
    const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      globalThis.openCallCaptureRequests.push(constraints!);
      const state = constraints?.audio ? openCallDevices.microphone : openCallDevices.camera;
      if (state !== "available") throw new DOMException("Capture unavailable", state === "missing" ? "NotFoundError" : "NotAllowedError");
      let stream: MediaStream;
      if (constraints?.video) {
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 180;
        const context = canvas.getContext("2d")!;
        let frame = 0;
        const timer = window.setInterval(() => {
          context.fillStyle = "#7566cb";
          context.fillRect(0, 0, 320, 180);
          context.fillStyle = "white";
          context.fillRect(frame++ % 280, 70, 40, 40);
        }, 80);
        stream = canvas.captureStream(12);
        const track = stream.getVideoTracks()[0]!;
        const stop = track.stop.bind(track);
        track.stop = () => { window.clearInterval(timer); stop(); };
      } else stream = await capture(constraints);
      globalThis.openCallCaptures.push(stream);
      return stream;
    };
    globalThis.RTCPeerConnection = new Proxy(RTCPeerConnection, { construct(target, args) {
      const peer = new target(...args);
      globalThis.openCallPeers.push(peer);
      return peer;
    } });
    globalThis.WebSocket = new Proxy(WebSocket, { construct(target, args) {
      const socket = new target(...args);
      globalThis.openCallSocket = socket;
      return socket;
    } });
  });
  await context.route(`${origin}/**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.startsWith("/v1/")) { await route.continue(); return; }
    const file = resolve(distribution, pathname === "/" ? "index.html" : `.${decodeURIComponent(pathname)}`);
    assert(file.startsWith(resolve(distribution) + sep));
    const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };
    await route.fulfill({ body: await readFile(file), contentType: types[extname(file)] ?? "application/octet-stream" });
  });
  const response = await context.request.post(`${origin}/v1/auth/login`, { data: { identifier, password: "northstar" } });
  assert.equal(response.status(), 200);
  const bootstrap = await (await context.request.get(`${origin}/v1/bootstrap`)).json();
  assert(bootstrap.meetings.every((meeting: { location: { type: string } }) => meeting.location.type === "room"));
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(20_000);
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
  const dailyBonus = page.locator(".daily-bonus-dialog");
  await dailyBonus.waitFor({ timeout: 5_000 }).catch(() => {});
  if (await dailyBonus.isVisible()) await page.getByRole("button", { name: "Close daily bonus" }).click();
  const skipGuide = page.locator(".game-guide-tooltip .guide-skip");
  await skipGuide.waitFor({ timeout: 5_000 }).catch(() => {});
  if (await skipGuide.isVisible()) await skipGuide.click();
  await page.getByRole("button", { name: "Close people", exact: true }).click();
  assert.equal(await page.evaluate(() => openCallCaptures.length), 0);
  return page;
}

async function enableMedia(page: Page) {
  await page.locator(".control-dock").getByRole("button", { name: "Unmute", exact: true }).click();
  await page.locator(".control-dock").getByRole("button", { name: "Turn camera on", exact: true }).click();
}

async function connected(page: Page, participants: number, withMedia = true) {
  try { await page.waitForFunction(({ count, withMedia }) => {
    const peers = openCallPeers.filter((peer) => peer.connectionState !== "closed");
    const videos = [...document.querySelectorAll<HTMLVideoElement>(".proximity-call video")];
    const audio = [...document.querySelectorAll<HTMLAudioElement>(".proximity-call audio")];
    return peers.length === count - 1 && peers.every((peer) => peer.connectionState === "connected")
      && document.querySelectorAll(".proximity-call .video-tile").length === count
      && (!withMedia || videos.length === count && videos.every((video) => video.videoWidth > 0 && video.readyState >= 2)
        && audio.length === count - 1 && audio.every((element) => (element.srcObject as MediaStream)?.getAudioTracks().some((track) => !track.muted)));
  }, { count: participants, withMedia }, { timeout: 30_000 }); } catch (error) {
    console.error(await page.evaluate(() => ({
      peers: openCallPeers.map((peer) => ({ state: peer.connectionState, signaling: peer.signalingState, tracks: peer.getReceivers().map((receiver) => ({ kind: receiver.track.kind, state: receiver.track.readyState, muted: receiver.track.muted })) })),
      captures: openCallCaptures.map((stream) => stream.getTracks().map((track) => ({ kind: track.kind, state: track.readyState }))),
      videos: [...document.querySelectorAll<HTMLVideoElement>(".proximity-call video")].map((video) => ({ width: video.videoWidth, state: video.readyState })),
      call: document.querySelector(".proximity-call")?.textContent,
      toast: document.querySelector(".toast")?.textContent,
    })));
    await page.screenshot({ path: resolve(artifacts, `failed-${participants}.png`) });
    throw error;
  }
}

async function stopped(page: Page) {
  await page.getByRole("region", { name: "Open call" }).waitFor({ state: "hidden" });
  await page.locator(".control-dock").getByRole("button", { name: "Unmute", exact: true }).waitFor();
  await page.locator(".control-dock").getByRole("button", { name: "Turn camera on", exact: true }).waitFor();
  assert(await page.evaluate(() => openCallCaptures.every((stream) => stream.getTracks().every((track) => track.readyState === "ended"))));
}

try {
  const maya = await login("maya");
  const leo = await login("leo");
  const theo = await login("theo");
  await maya.evaluate(() => {
    const send = openCallSocket.send.bind(openCallSocket);
    openCallSocket.send = (data) => {
      if (typeof data === "string" && JSON.parse(data).type === "call.request") {
        openCallSocket.send = send;
        return;
      }
      send(data);
    };
  });
  await maya.getByRole("region", { name: "Nearby actions" }).getByRole("button", { name: "Call", exact: true }).click();
  await maya.getByText("Starting call…", { exact: true }).waitFor();
  await maya.getByRole("alert").getByText("The call did not start. Try again.", { exact: true }).waitFor();
  await leo.getByRole("combobox", { name: "Availability" }).selectOption("dnd");
  await leo.waitForFunction(() => document.querySelector<HTMLSelectElement>('[aria-label="Availability"]')?.value === "dnd");
  await maya.getByRole("button", { name: "Retry call", exact: true }).click();
  await maya.getByRole("alert").getByText("They are unavailable.", { exact: true }).waitFor();
  assert.equal(await leo.getByRole("button", { name: "Accept call from Maya Chen" }).count(), 0);
  await maya.screenshot({ path: resolve(artifacts, "call-error-desktop.png") });
  await maya.setViewportSize({ width: 390, height: 844 });
  const errorBounds = await maya.getByRole("alert").boundingBox();
  assert(errorBounds && errorBounds.x >= 0 && errorBounds.x + errorBounds.width <= 390);
  await maya.getByRole("button", { name: "Retry call", exact: true }).click({ trial: true });
  await maya.getByRole("button", { name: "Dismiss call error", exact: true }).click({ trial: true });
  await maya.screenshot({ path: resolve(artifacts, "call-error-mobile.png") });
  await maya.setViewportSize({ width: 1440, height: 1000 });
  await leo.getByRole("combobox", { name: "Availability" }).selectOption("available");
  await leo.waitForFunction(() => document.querySelector<HTMLSelectElement>('[aria-label="Availability"]')?.value === "available");
  await maya.getByRole("button", { name: "Retry call", exact: true }).click();
  await maya.getByRole("button", { name: "Cancel call to Leo Martins" }).waitFor();
  await leo.setViewportSize({ width: 390, height: 844 });
  await leo.getByRole("button", { name: "Accept call from Maya Chen" }).click({ trial: true });
  await leo.screenshot({ path: resolve(artifacts, "incoming-call-mobile.png") });
  assert.equal(await maya.evaluate(() => openCallCaptureRequests.length), 0);
  await leo.getByRole("button", { name: "Accept call from Maya Chen" }).click();
  await leo.setViewportSize({ width: 1440, height: 1000 });
  await Promise.all([maya, leo].map((page) => connected(page, 2, false)));
  assert.equal(await leo.evaluate(() => openCallCaptureRequests.length), 0);
  await verifyCallDeviceChanges(maya, leo, artifacts);
  await Promise.all([maya, leo].map((page) => connected(page, 2)));
  await verifyCallRecovery([maya, leo]);
  await theo.getByRole("region", { name: "Nearby actions" }).getByRole("button", { name: "Join call", exact: true }).click();
  await Promise.all([maya, leo, theo].map((page) => connected(page, 3, false)));
  assert(await theo.getByRole("region", { name: "Nearby actions" }).getByRole("button", { name: "In call", exact: true }).isDisabled());
  assert.equal(await theo.evaluate(() => openCallCaptureRequests.length), 0);
  await enableMedia(theo);
  await Promise.all([maya, leo, theo].map((page) => connected(page, 3)));
  await maya.screenshot({ path: resolve(artifacts, "open-call-desktop.png") });
  const call = maya.locator(".proximity-call");
  await call.getByRole("button", { name: "Expand call" }).click();
  const expandedBounds = await call.boundingBox();
  assert(expandedBounds && expandedBounds.width > 1300 && expandedBounds.height > 900);
  await call.getByRole("button", { name: "Focus Leo Martins" }).click();
  assert.equal(await call.locator(".call-stage-primary footer strong").innerText(), "Leo Martins");
  await maya.screenshot({ path: resolve(artifacts, "open-call-focused-desktop.png") });
  await call.getByRole("button", { name: "Show gallery" }).click();
  await call.getByRole("button", { name: "Enter fullscreen" }).click();
  await maya.waitForFunction(() => document.fullscreenElement?.classList.contains("proximity-call"));
  await maya.screenshot({ path: resolve(artifacts, "open-call-fullscreen.png") });
  await maya.keyboard.press("Escape");
  await maya.waitForFunction(() => !document.fullscreenElement);
  assert(await call.isVisible());
  await maya.setViewportSize({ width: 390, height: 844 });
  await call.getByRole("button", { name: "Focus Leo Martins" }).click();
  const primary = await call.locator(".call-stage-primary").boundingBox();
  const filmstrip = await call.locator(".call-stage-filmstrip").boundingBox();
  assert(primary && filmstrip && filmstrip.y >= primary.y + primary.height - 1);
  await maya.screenshot({ path: resolve(artifacts, "open-call-focused-mobile.png") });
  await call.getByRole("button", { name: "Show gallery" }).click();
  await maya.setViewportSize({ width: 320, height: 568 });
  await call.getByRole("button", { name: "Focus Leo Martins" }).click();
  assert.equal(await maya.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await maya.screenshot({ path: resolve(artifacts, "open-call-focused-small.png") });
  await call.getByRole("button", { name: "Show gallery" }).click();
  await call.getByRole("button", { name: "Minimize call" }).click();
  await maya.setViewportSize({ width: 390, height: 844 });
  await maya.screenshot({ path: resolve(artifacts, "open-call-mobile.png") });
  const bounds = await maya.getByRole("region", { name: "Open call" }).boundingBox();
  assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y + bounds.height < 740);
  await maya.setViewportSize({ width: 1440, height: 1000 });
  await theo.getByRole("button", { name: "Leave conversation" }).click();
  await stopped(theo);
  await Promise.all([maya, leo].map((page) => connected(page, 2)));
  await enableMedia(theo);
  await Promise.all([maya, leo, theo].map((page) => connected(page, 3)));
  await leo.evaluate(() => openCallSocket.send(JSON.stringify({ type: "movement.set_destination", requestId: crypto.randomUUID(), floorId: "floor-studio", x: 380, y: 100 })));
  await stopped(leo);
  await Promise.all([maya, theo].map((page) => connected(page, 2)));
  await theo.context().close();
  await stopped(maya);
  await verifyMeetingDeviceChanges(maya, leo, artifacts);
  assert.deepEqual(errors, []);
  console.log("PASS: The Call button sends the invitation; lost requests time out, rejected calls show errors, and retry rings the recipient. Calls and meetings join without devices, keep receiving after capture failures and muting, and enable selected devices after joining. ICE recovery and WebGL restoration preserve audio, video and the WebSocket connection. Three participants exchange media; leave, walking away, and disconnect stop capture; desktop and mobile fit.");
} finally {
  await browser.close();
  await application.app.close();
}
