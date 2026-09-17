import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import { DEFAULT_CHARACTER_APPEARANCE } from "../../packages/shared/src/index.ts";
import { createTestData } from "../../apps/server/src/testing/workspace-data.ts";
import { WorkspaceStore } from "../../apps/server/src/store.ts";
import { WorldRuntime } from "../../apps/server/src/world/world-runtime.ts";
import { installBuiltAssetClient } from "../world-assets/built-client.ts";
import { installWorldProbe } from "../characters/playwright-animation.ts";

const root = resolve(import.meta.dirname, "../..");
const output = resolve(root, process.argv[2] ?? "artifacts/performance-investigation-2026-09-17");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const results = [];
try {
  for (const delayMs of [0, 40]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    await installBuiltAssetClient(context, resolve(output, "client"));
    const store = new WorkspaceStore(createTestData());
    for (const member of store.getMembers()) {
      member.character = { ...DEFAULT_CHARACTER_APPEARANCE };
      member.online = member.id === "user-maya";
    }
    store.getMember("user-maya").position = { x: 410, y: 650 };
    const runtime = new WorldRuntime(store);
    const serverCommands = [];
    const timers = new Set();
    let stopped = false;
    const dispatch = (callback) => {
      if (delayMs === 0) { callback(); return; }
      const timer = setTimeout(() => { timers.delete(timer); if (!stopped) callback(); }, delayMs);
      timers.add(timer);
    };
    await context.route("**/v1/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/v1/auth/session") await route.fulfill({ json: { user: { id: "user-maya", username: "probe" }, setupRequired: false,
        registration: { enabled: false, invitationRequired: true }, magicLinkEnabled: false, corporateIdentity: store.getCorporateIdentity() } });
      else if (path === "/v1/bootstrap") await route.fulfill({ json: store.getBootstrap("user-maya") });
      else await route.fulfill({ status: 404, json: { error: "Unexpected probe request" } });
    });
    await context.routeWebSocket(/\/v1\//, socket => {
      const peer = runtime.connect("user-maya", "floor-studio", event => {
        const payload = JSON.stringify(event);
        dispatch(() => socket.send(payload));
      });
      socket.onMessage(message => dispatch(() => {
        const command = JSON.parse(String(message));
        const start = performance.now();
        runtime.handleCommand(peer, command);
        serverCommands.push({ type: command.type, milliseconds: performance.now() - start });
      }));
      socket.onClose(() => runtime.disconnect(peer));
    });
    runtime.start();
    const page = await context.newPage();
    await page.addInitScript("globalThis.__name = value => value");
    await installWorldProbe(page);
    await page.addInitScript(() => {
      const empty = () => ({ frames: [], renderCpuMs: [], readbackMs: [], decodeMs: [], longTasks: [], longFrames: [], textureUploads: 0 });
      let work = empty();
      let previous;
      let latestSnapshotAt = 0;
      const frames = now => { if (previous !== undefined) work.frames.push(now - previous); previous = now; requestAnimationFrame(frames); };
      requestAnimationFrame(frames);
      const originalInit = globalThis.__PIXI_APP_INIT__;
      globalThis.__PIXI_APP_INIT__ = app => {
        originalInit(app);
        const originalRender = app.renderer.render;
        app.renderer.render = function (...args) {
          const start = performance.now();
          try { return originalRender.apply(this, args); } finally { work.renderCpuMs.push(performance.now() - start); }
        };
      };
      const read = CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData = function (...args) {
        const start = performance.now();
        try { return read.apply(this, args); } finally { work.readbackMs.push(performance.now() - start); }
      };
      const decode = HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode = async function () {
        const start = performance.now();
        try { return await decode.call(this); } finally { work.decodeMs.push(performance.now() - start); }
      };
      for (const name of ["texImage2D", "texSubImage2D"]) {
        const original = WebGL2RenderingContext.prototype[name];
        WebGL2RenderingContext.prototype[name] = function (...args) { work.textureUploads++; return original.apply(this, args); };
      }
      const Socket = WebSocket;
      globalThis.WebSocket = class extends Socket {
        constructor(...args) {
          super(...args);
          this.addEventListener("message", message => {
            if (JSON.parse(message.data).type === "world.snapshot") latestSnapshotAt = performance.now();
          });
        }
      };
      for (const type of ["longtask", "long-animation-frame"]) {
        if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
        new PerformanceObserver(list => {
          const key = type === "longtask" ? "longTasks" : "longFrames";
          work[key].push(...list.getEntries().map(entry => ({ startTime: entry.startTime, duration: entry.duration,
            scripts: entry.scripts?.map(script => ({ duration: script.duration, sourceURL: script.sourceURL, sourceFunctionName: script.sourceFunctionName })) })));
        }).observe({ type });
      }
      globalThis.investigationProbe = {
        reset: () => { work = empty(); previous = undefined; }, result: () => work,
        lastSnapshot: () => latestSnapshotAt,
      };
    });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.start");
    const phases = {};
    try {
      const started = performance.now();
      await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
      await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
      await page.waitForFunction(() => Boolean(globalThis.findAvatar("You")));
      phases.startup = { avatarReadyMs: performance.now() - started, work: await page.evaluate(() => investigationProbe.result()),
        resources: await page.evaluate(() => performance.getEntriesByType("resource").map(entry => ({ name: new URL(entry.name).pathname, bytes: entry.decodedBodySize, duration: entry.duration }))) };
      await page.waitForTimeout(1000);
      await page.evaluate(() => investigationProbe.reset());
      await page.waitForTimeout(6000);
      phases.idle = await page.evaluate(() => investigationProbe.result());
      await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); investigationProbe.reset(); });
      const inputs = [];
      for (let index = 0; index < 16; index++) {
        inputs.push(await page.evaluate(async index => {
          const key = index % 2 === 0 ? "ArrowRight" : "ArrowLeft";
          const player = findAvatar("You").parent.parent;
          const initial = { x: player.x, y: player.y };
          const started = performance.now();
          const previousSnapshot = investigationProbe.lastSnapshot();
          window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
          let firstMotionMs, snapshotArrivalMs;
          while (performance.now() - started < 250) {
            await new Promise(requestAnimationFrame);
            if (snapshotArrivalMs === undefined && investigationProbe.lastSnapshot() > previousSnapshot) snapshotArrivalMs = investigationProbe.lastSnapshot() - started;
            if (firstMotionMs === undefined && Math.hypot(player.x - initial.x, player.y - initial.y) > 0.5) firstMotionMs = performance.now() - started;
          }
          window.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true }));
          await new Promise(resolve => setTimeout(resolve, 550));
          return { firstMotionMs, snapshotArrivalMs };
        }, index));
      }
      phases.movement = { inputs, work: await page.evaluate(() => investigationProbe.result()) };
      const { profile } = await cdp.send("Profiler.stop");
      await writeFile(resolve(output, `frames-${delayMs}.cpuprofile`), JSON.stringify(profile));
      phases.scene = await page.evaluate(() => {
        const app = globalThis.avatarWorld;
        const queue = [app.stage];
        const textures = new Set();
        for (const node of queue) {
          queue.push(...node.children ?? []);
          if (node.texture?.source) textures.add(node.texture.source);
        }
        const canvas = document.querySelector(".world-canvas canvas");
        const gl = canvas.getContext("webgl2");
        const extension = gl?.getExtension("WEBGL_debug_renderer_info");
        return { nodes: queue.length, textureSources: textures.size, rgbaBytes: [...textures].reduce((sum, texture) => sum + texture.width * texture.height * 4, 0),
          renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : "unavailable", width: canvas.width, height: canvas.height };
      });
      results.push({ artificialOneWayDelayMs: delayMs, phases, serverCommands, errors });
      console.log(JSON.stringify({ artificialOneWayDelayMs: delayMs, startupMs: phases.startup.avatarReadyMs, scene: phases.scene, errors }));
    } finally {
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
      runtime.stop();
      await context.close();
      await writeFile(resolve(output, "frames.json"), JSON.stringify({ browser: browser.version(), methodology: "Production assets routed from disk, API and WebSocket routed to an in-process fixture. One visible world player, identical portrait appearances, DPR 1, 1440x1000. Six seconds idle and sixteen movement probes. Delays are synthetic, not measured network RTT. Instrumented headless browser; renderer times are CPU submission, not GPU time.", results }, null, 2) + "\n");
    }
  }
} finally { await browser.close(); }
