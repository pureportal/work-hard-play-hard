import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const output = new URL("../artifacts/area-popups/", import.meta.url);
const origin = "http://127.0.0.1:5173";
const sizes = [[1440, 900], [390, 844], [320, 568], [844, 390]];
const results = [];
const errors = [];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });

async function capture(page, name, selector) {
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), animations: "disabled" });
  const bounds = await page.locator(selector).evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth };
  });
  const viewport = page.viewportSize();
  assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, `${name}: surface bounds`);
  assert(bounds.scrollWidth <= bounds.clientWidth + 1, `${name}: surface overflow`);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: page overflow`);
  results.push({ name, ...bounds });
}

async function reachable(page, locator, touch = false) {
  const bounds = await locator.boundingBox();
  const viewport = page.viewportSize();
  assert(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, `Reachable: ${await locator.getAttribute("aria-label")}`);
  if (touch) assert(bounds.width >= 44 && bounds.height >= 44, "Touch target size");
  assert(await locator.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
  }), "Control is unobstructed");
}

async function position(page, userId, x, y) {
  await page.waitForFunction(({userId, x, y}) => {
    const player = window.areaReview.snapshot?.players.find(player => player.userId === userId);
    return player && Math.hypot(player.x - x, player.y - y) < 14;
  }, {userId, x, y}, { timeout: 30000 });
}

async function move(page, userId, x, y) {
  await page.evaluate(({x, y}) => window.areaReview.socket.send(JSON.stringify({type:"movement.set_destination", requestId:crypto.randomUUID(), floorId:"floor-workplace", x, y})), {x, y});
  await position(page, userId, x, y);
}

async function clickWorld(page, x, y, touch) {
  const point = await page.evaluate(({x,y}) => {
    const queue = [window.areaReview.world.stage];
    let node;
    while (queue.length) {
      const candidate = queue.shift();
      if (candidate.label === "world-asset:floor-workplace-falling-blocks") { node = candidate; break; }
      queue.push(...candidate.children ?? []);
    }
    const point = node.parent.toGlobal({x,y});
    const canvas = document.querySelector(".world-canvas canvas").getBoundingClientRect();
    return { x: canvas.x + point.x, y: canvas.y + point.y };
  }, {x,y});
  assert(await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.tagName === "CANVAS", point), `Walking destination is exposed (${point.x}, ${point.y})`);
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

async function walk(page, userId, x, y, touch) {
  await clickWorld(page, x, y, touch);
  await position(page, userId, x, y);
}

async function enterGame(page, touch) {
  await clickWorld(page, 1360, 800, touch);
  const join = page.getByRole("button", { name: "Join lobby", exact: true });
  await Promise.race([join.waitFor(), page.locator(".falling-blocks-lobby").waitFor()]);
  if (await join.isVisible()) await join.click();
  await page.locator(".falling-blocks-lobby").waitFor();
}

async function area(page, id, selector) {
  const expand = page.locator(".interaction-expand");
  if (await expand.isVisible()) await expand.click();
  const select = page.getByRole("combobox", { name: "Active interaction" });
  if (await select.isVisible()) await select.selectOption(`floor-workplace-${id}`);
  await page.locator(selector).waitFor();
}

try {
  for (const [width, height] of sizes) {
    if (process.env.AREA_VIEWPORTS && !process.env.AREA_VIEWPORTS.split(",").includes(`${width}x${height}`)) continue;
    const touch = width < 1000;
    const context = await browser.newContext({viewport:{width,height}, hasTouch:touch, isMobile:touch});
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(60000);
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      window.areaReview = { errors: [], commands: [] };
      window.__PIXI_APP_INIT__ = world => { window.areaReview.world = world; };
      const Socket = window.WebSocket;
      window.WebSocket = class extends Socket {
        constructor(...args) {
          super(...args);
          if (!String(args[0]).includes("/v1/realtime")) return;
          window.areaReview.socket = this;
          this.addEventListener("message", ({data}) => {
            const event = JSON.parse(data);
            if (event.type === "world.snapshot") window.areaReview.snapshot = event;
            if (event.type === "command.error") window.areaReview.errors.push(event);
          });
        }
        send(data) {
          window.areaReview.commands.push(JSON.parse(data));
          super.send(data);
        }
      };
    });
    const prefix = `${width}x${height}`;
    try {
      await page.goto(origin, {waitUntil:"domcontentloaded"});
      await page.getByRole("textbox", {name:"Username or email"}).fill("member");
      await page.getByLabel("Password", {exact:true}).fill("password");
      await page.getByRole("button", {name:"Sign in", exact:true}).click();
      await page.getByRole("status").filter({hasText:/^Connected$/}).waitFor();
      const data = await (await context.request.get(`${origin}/v1/bootstrap`)).json();
      const userId = data.currentUserId;
      const closePeople = page.getByRole("button", {name:"Close people", exact:true});
      if (await closePeople.isVisible()) await closePeople.click();
      if (width === 844) await page.locator(".theme-toggle").click();
      await page.locator(".floor-picker select").selectOption("floor-workplace");
      await move(page, userId, 1200, 800);
      await page.getByRole("button", {name:"Zoom out", exact:true}).click();
      await page.getByRole("button", {name:"Zoom out", exact:true}).click();
      const hide = page.getByRole("button", {name:"Hide nearby actions", exact:true});
      if (await hide.isVisible()) await hide.click();
      await enterGame(page, touch);
      await area(page, "falling-blocks", ".falling-blocks-lobby");
      await capture(page, `${prefix}-lobby`, ".interaction-panel");
      await reachable(page, hide, touch);
      const mode = page.locator(".falling-blocks-settings select");
      await mode.selectOption("speed-up");
      await hide.click();
      assert.equal(await page.locator(".falling-blocks-lobby").isVisible(), false);
      await capture(page, `${prefix}-collapsed`, ".interaction-panel");
      await page.getByRole("button", {name:"Show Falling Blocks", exact:true}).click();
      assert.equal(await mode.inputValue(), "speed-up");
      await mode.selectOption("classic");
      const content = page.locator(".interaction-content");
      if (touch) {
        const bounds = await content.boundingBox();
        const cdp = await context.newCDPSession(page);
        const start = {x:bounds.x + bounds.width / 2, y:bounds.y + bounds.height - 24};
        await cdp.send("Input.dispatchTouchEvent", {type:"touchStart", touchPoints:[start]});
        for (let step = 1; step <= 8; step++) {
          await cdp.send("Input.dispatchTouchEvent", {type:"touchMove", touchPoints:[{x:start.x, y:start.y - step * 16}]});
        }
        await cdp.send("Input.dispatchTouchEvent", {type:"touchEnd", touchPoints:[]});
        await page.waitForFunction(() => document.querySelector(".interaction-content").scrollTop > 0);
        await cdp.detach();
      }
      await content.evaluate(element => { element.scrollTop = element.scrollHeight; });
      await reachable(page, hide, touch);
      await hide.click();
      await walk(page, userId, 1200, 800, touch);
      await enterGame(page, touch);
      await area(page, "falling-blocks", ".falling-blocks-lobby");
      await page.locator(".falling-blocks-lobby").getByRole("button", {name:"Play", exact:true}).click();
      await page.locator(".falling-blocks-game").waitFor();
      if (!touch) await page.getByRole("button", {name:"Show controls", exact:true}).click();
      await page.getByRole("button", {name:"Move left", exact:true}).waitFor();
      if (touch) {
        const bounds = await page.getByRole("button", {name:"Move left", exact:true}).boundingBox();
        const cdp = await context.newCDPSession(page);
        const before = await page.evaluate(() => window.areaReview.commands.filter(command => command.type === "game.command" && command.command === "left").length);
        await cdp.send("Input.dispatchTouchEvent", {type:"touchStart", touchPoints:[{x:bounds.x + bounds.width / 2, y:bounds.y + bounds.height / 2}]});
        await page.waitForFunction(before => window.areaReview.commands.filter(command => command.type === "game.command" && command.command === "left").length >= before + 2, before);
        await cdp.send("Input.dispatchTouchEvent", {type:"touchEnd", touchPoints:[]});
        const released = await page.evaluate(() => window.areaReview.commands.filter(command => command.type === "game.command" && command.command === "left").length);
        await page.waitForTimeout(150);
        assert.equal(await page.evaluate(() => window.areaReview.commands.filter(command => command.type === "game.command" && command.command === "left").length), released);
        await cdp.detach();
      }
      for (const label of ["Move left", "Move right", "Rotate clockwise", "Rotate counterclockwise", "Soft drop", "Hold", "Drop", "Pause"]) {
        const button = page.getByRole("button", {name:label, exact:true});
        await reachable(page, button, true);
        if (touch) await button.tap(); else await button.click();
      }
      await page.getByRole("button", {name:"Resume", exact:true}).waitFor();
      await capture(page, `${prefix}-game`, ".falling-blocks-game");
      await reachable(page, page.getByRole("img", {name:"Falling Blocks board"}));
      await page.getByRole("button", {name:"Close game", exact:true}).click();
      await page.getByRole("button", {name:"Keep playing", exact:true}).click();
      await page.getByRole("button", {name:"Close game", exact:true}).click();
      await page.getByRole("button", {name:"Leave game", exact:true}).click();
      await page.locator(".falling-blocks-game").waitFor({state:"hidden"});
      await area(page, "falling-blocks", ".falling-blocks-lobby");
      await hide.click();
      await move(page, userId, 1488, 784);
      await area(page, "tic-tac-toe", ".tic-tac-toe-lobby");
      await capture(page, `${prefix}-tic-tac-toe-lobby`, ".interaction-panel");
      await page.locator(".tic-tac-toe-lobby").getByRole("button", {name:"Play", exact:true}).click();
      await page.locator(".tic-tac-toe-game").waitFor();
      await page.locator('.tic-tac-toe-game button[role="gridcell"]:not(:disabled)').first().click();
      await page.getByRole("status").filter({hasText:"Your turn"}).waitFor();
      await capture(page, `${prefix}-tic-tac-toe`, ".tic-tac-toe-game");
      await page.getByRole("button", {name:"Forfeit game", exact:true}).click();
      await page.getByRole("button", {name:"Leave game", exact:true}).click();
      await page.locator(".tic-tac-toe-game").waitFor({state:"hidden"});
      await move(page, userId, 1520, 848);
      await area(page, "chess", ".chess-lobby");
      await capture(page, `${prefix}-chess-lobby`, ".interaction-panel");
      await page.locator(".chess-lobby").getByRole("button", {name:"Players", exact:true}).click();
      await page.getByRole("button", {name:"New game", exact:true}).click();
      await page.getByRole("radio", {name:"Rapid", exact:false}).check();
      await page.getByRole("radio", {name:"Locked", exact:true}).check();
      const createGame = page.getByRole("button", {name:"Create game", exact:true});
      await createGame.scrollIntoViewIfNeeded();
      await reachable(page, createGame, touch);
      await reachable(page, hide, touch);
      await hide.click();
      await page.getByRole("button", {name:"Show Chess", exact:true}).click();
      assert(await page.getByRole("radio", {name:"Rapid", exact:false}).isChecked());
      await page.getByRole("button", {name:"Close setup", exact:true}).click();
      await hide.click();
      await page.getByRole("navigation", {name:"Workspace", exact:true}).getByRole("button", {name:"Messages", exact:true}).click();
      await page.locator(".chat-panel").waitFor();
      await capture(page, `${prefix}-chat`, ".chat-panel");
      const messageBounds = await page.locator(".message-list").boundingBox();
      assert(messageBounds.height >= 80, "Message history remains readable");
      await reachable(page, page.getByRole("button", {name:"Close messages", exact:true}), touch);
      const input = page.locator('.chat-panel input:not([type="file"])');
      await input.fill("Draft for popup review");
      await reachable(page, page.getByRole("button", {name:"Send message", exact:true}), touch);
      await page.locator(".message-list").evaluate(element => {element.scrollTop = 0;});
      await page.getByRole("button", {name:"Jump to latest", exact:true}).click();
      assert(await page.locator(".message-list").evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight < 2));
      await page.getByRole("tab", {name:"Games Room", exact:true}).click();
      await capture(page, `${prefix}-chat-room`, ".chat-panel");
      if (width <= 700) {
        await input.focus();
        await page.evaluate(() => {
          Object.defineProperty(visualViewport, "height", {configurable:true, value:320});
          Object.defineProperty(visualViewport, "offsetTop", {configurable:true, value:40});
          visualViewport.dispatchEvent(new Event("resize"));
        });
        await capture(page, `${prefix}-chat-keyboard-simulation`, ".chat-panel");
        const keyboardBounds = await page.locator(".chat-panel").boundingBox();
        assert(keyboardBounds.y >= 40 && keyboardBounds.y + keyboardBounds.height <= 360, "Chat fits above the simulated keyboard");
        await reachable(page, page.getByRole("button", {name:"Close messages", exact:true}), true);
        await reachable(page, page.getByRole("button", {name:"Send message", exact:true}), true);
        await page.evaluate(() => {
          delete visualViewport.height;
          delete visualViewport.offsetTop;
          visualViewport.dispatchEvent(new Event("resize"));
        });
      }
      await input.focus();
      await page.keyboard.press("Escape");
      await page.locator(".chat-panel").waitFor({state:"hidden"});
      await page.getByRole("navigation", {name:"Workspace", exact:true}).getByRole("button", {name:"Messages", exact:true}).click();
      await page.getByRole("button", {name:"Close messages", exact:true}).click();
      const nearby = await page.evaluate(userId => window.areaReview.snapshot.players.find(player => player.userId !== userId && player.connected && player.roomId === "room-gallery"), userId);
      assert(nearby, "A gallery participant is present for nearby chat");
      await move(page, userId, nearby.x, nearby.y);
      const expand = page.locator(".interaction-expand");
      if (await expand.isVisible()) await expand.click();
      const active = page.getByRole("combobox", {name:"Active interaction", exact:true});
      if (await active.isVisible()) await active.selectOption(nearby.userId);
      await page.locator(".nearby-person-actions").getByRole("button", {name:"Chat", exact:true}).waitFor();
      await capture(page, `${prefix}-nearby-person`, ".interaction-panel");
      await page.locator(".nearby-person-actions").getByRole("button", {name:"Chat", exact:true}).click();
      await page.locator(".chat-panel").waitFor();
      await capture(page, `${prefix}-nearby-chat`, ".chat-panel");
      await page.getByRole("button", {name:"Close messages", exact:true}).click();
      await reachable(page, hide, touch);
      assert.deepEqual(await page.evaluate(() => window.areaReview.errors), []);
      console.log(`${prefix}: area entry, collapse, scrolling, re-entry, games, chat drafting, tabs and dismissal passed`);
    } catch (error) {
      await page.screenshot({path:fileURLToPath(new URL(`${prefix}-failure.png`,output))});
      console.error(await page.locator("body").innerText());
      console.error(await page.evaluate(() => ({errors: window.areaReview.errors, players:window.areaReview.snapshot?.players.filter(player=>player.userId === "person-lucia"), commands:window.areaReview.commands.slice(-4)})));
      throw error;
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await writeFile(new URL(process.env.AREA_VIEWPORTS ? "selected-results.json" : "results.json", output), JSON.stringify({errors, results}, null, 2));
}
