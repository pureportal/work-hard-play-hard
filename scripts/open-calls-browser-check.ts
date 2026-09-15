import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type AddressInfo } from "node:net";
import { chromium, type Page } from "playwright-core";
import { createTestApplication } from "../apps/server/src/testing/application.js";
import { MemoryDatabase } from "../apps/server/src/persistence/memory-database.js";

declare global {
  var openCallCaptures: MediaStream[];
  var openCallPeers: RTCPeerConnection[];
  var openCallSocket: WebSocket;
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
  const positions: Record<string, { x: number; y: number }> = { "user-maya": { x: 100, y: 100 }, "user-leo": { x: 160, y: 100 }, "user-theo": { x: 150, y: 200 } };
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
    const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
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
  await page.getByRole("button", { name: "Close people", exact: true }).click();
  assert.equal(await page.evaluate(() => openCallCaptures.length), 0);
  return page;
}

async function enableMedia(page: Page) {
  await page.locator(".control-dock").getByRole("button", { name: "Unmute", exact: true }).click();
  await page.locator(".control-dock").getByRole("button", { name: "Turn camera on", exact: true }).click();
}

async function connected(page: Page, participants: number) {
  try { await page.waitForFunction((count) => {
    const peers = openCallPeers.filter((peer) => peer.connectionState !== "closed");
    const videos = [...document.querySelectorAll<HTMLVideoElement>(".proximity-call video")];
    const audio = [...document.querySelectorAll<HTMLAudioElement>(".proximity-call audio")];
    return peers.length === count - 1 && peers.every((peer) => peer.connectionState === "connected")
      && videos.length === count && videos.every((video) => video.videoWidth > 0 && video.readyState >= 2)
      && audio.length === count - 1 && audio.every((element) => (element.srcObject as MediaStream)?.getAudioTracks().some((track) => !track.muted));
  }, participants, { timeout: 30_000 }); } catch (error) {
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
  await maya.getByRole("region", { name: "Nearby actions" }).getByRole("button", { name: "Call", exact: true }).click();
  assert.equal(await maya.getByRole("region", { name: "Open call" }).count(), 0);
  await maya.evaluate(() => openCallSocket.send(JSON.stringify({ type: "call.request", requestId: crypto.randomUUID(), targetUserId: "user-leo" })));
  await leo.getByRole("button", { name: "Accept call from Maya Chen" }).click();
  await Promise.all([maya, leo].map((page) => connected(page, 2)));
  await enableMedia(theo);
  await Promise.all([maya, leo, theo].map((page) => connected(page, 3)));
  await maya.screenshot({ path: resolve(artifacts, "open-call-desktop.png") });
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
  assert.deepEqual(errors, []);
  console.log("PASS: Three browser tabs exchange camera and audio; new coworkers join; leave, walking away, and disconnect stop devices; desktop and mobile fit.");
} finally {
  await browser.close();
  await application.app.close();
}
