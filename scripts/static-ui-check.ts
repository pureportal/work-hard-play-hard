import { readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type HTTPRequest, type Page } from "puppeteer";
import { DemoStore } from "../apps/server/src/store.js";

const workspaceDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distributionDirectory = resolve(workspaceDirectory, "apps/web/dist");
const artifactDirectory = resolve(workspaceDirectory, "artifacts");
const bootstrap = new DemoStore().getBootstrap("user-maya");
bootstrap.conversations = bootstrap.conversations.filter((conversation) => conversation.id !== "conversation-jonas");
bootstrap.messages = bootstrap.messages.filter((message) => message.conversationId !== "conversation-jonas");

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
const browserIssues: string[] = [];
page.setDefaultTimeout(15_000);
page.on("console", (message) => {
  if (message.type() === "error") {
    browserIssues.push(`Browser console: ${message.text()}`);
  }
});
page.on("pageerror", (error) => browserIssues.push(`Browser error: ${error.message}`));
page.on("requestfailed", (request) => browserIssues.push(`Request failed: ${request.url()} ${request.failure()?.errorText ?? "unknown"}`));
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await installApplicationTransport(page);

try {
  await page.goto("http://localhost/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".world-canvas canvas", { visible: true });
  await page.waitForFunction(() => document.querySelector(".connection-state")?.classList.contains("online"));
  await assertViewport(page, [".nav-rail", ".top-bar", ".side-panel", ".control-dock"]);
  report("desktop workspace ready");

  await page.keyboard.press("3");
  await page.waitForFunction(() => {
    const commands = (globalThis as typeof globalThis & { mockSockets: Array<{ commands: Array<{ type: string; reaction?: string }> }> })
      .mockSockets.at(-1)?.commands ?? [];
    return commands.some((command) => command.type === "interaction.react" && command.reaction === "celebrate");
  });
  await page.screenshot({ path: resolve(artifactDirectory, "iteration-desktop-reaction.png") });
  report("reaction shortcut ready");
  await page.evaluate(() => {
    const socket = (globalThis as typeof globalThis & { mockSockets: Array<{ emit: (event: unknown) => void }> }).mockSockets.at(-1);
    socket?.emit({
      type: "interaction.high_five",
      id: "high-five-check",
      userIds: ["user-maya", "user-elena"],
      floorId: "floor-studio",
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 180));
  await page.screenshot({ path: resolve(artifactDirectory, "iteration-desktop-high-five.png") });
  report("high five celebration ready");
  await new Promise((resolve) => setTimeout(resolve, 2_300));

  await page.evaluate(() => {
    const picker = document.querySelector<HTMLSelectElement>(".floor-picker select");
    if (!picker) {
      throw new Error("Floor picker is missing.");
    }
    picker.value = "floor-rooftop";
    picker.dispatchEvent(new Event("change", { bubbles: true }));
    picker.value = "floor-studio";
    picker.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(() => {
    const commands = (globalThis as typeof globalThis & { mockSockets: Array<{ commands: Array<{ type: string; floorId?: string }> }> })
      .mockSockets.at(-1)?.commands.filter((command) => command.type === "floor.change") ?? [];
    return commands.at(-1)?.floorId === "floor-studio";
  });
  await page.waitForFunction(() => document.querySelector<HTMLSelectElement>(".floor-picker select")?.value === "floor-studio");
  await page.waitForFunction(() => document.querySelector(".connection-state")?.classList.contains("online"));
  report("rapid floor choice ready");

  await page.setViewport({ width: 320, height: 568, deviceScaleFactor: 1 });
  await page.click('button[aria-label="Close people"]');
  await page.waitForSelector(".people-panel", { hidden: true });
  await page.click('.control-dock button[aria-label="React"]');
  await page.waitForSelector(".control-dock .reaction-popover", { visible: true });
  await assertViewport(page, [".control-dock", ".control-dock .reaction-popover"]);
  await assertTouchUi(page);
  await page.screenshot({ path: resolve(artifactDirectory, "iteration-compact-reactions.png") });
  await page.click('.control-dock button[aria-label="Heart (2)"]');
  await page.waitForSelector(".control-dock .reaction-popover", { hidden: true });
  report("compact reaction picker ready");

  await page.click('button[aria-label="Build"]');
  await page.waitForSelector(".build-panel", { visible: true });
  await assertViewport(page, [".nav-rail", ".top-bar", ".build-panel", ".control-dock"]);
  await assertContained(page, ".build-panel", [".room-control", ".room-control select", ".room-control .icon-button"]);
  await page.screenshot({ path: resolve(artifactDirectory, "iteration-compact-build.png") });
  report("compact build ready");

  await page.click('button[aria-label="People"]');
  await page.click('button[aria-label="Jonas Berg"]');
  await page.click('button[aria-label="Message Jonas Berg"]');
  await page.waitForSelector('input[aria-label="Message Jonas Berg"]', { visible: true });
  await assertViewport(page, [".nav-rail", ".chat-panel", ".message-composer"]);
  await assertContained(page, ".conversation-tabs", ['button[aria-selected="true"]']);
  await assertTouchUi(page);
  await page.screenshot({ path: resolve(artifactDirectory, "iteration-compact-direct-message.png") });
  report("compact messages ready");

  await page.click('button[aria-label="Meetings"]');
  await clickButtonWithText(page, "Join");
  await page.waitForSelector(".meeting-overlay", { visible: true });
  assert(await page.$eval(".meeting-overlay", (element) => document.activeElement === element), "Meeting dialog did not receive focus.");
  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
  await assertViewport(page, [".meeting-overlay", ".meeting-overlay-header", ".meeting-controls"]);
  await assertFullyContained(page, ".meeting-chat", [".meeting-chat > header", ".meeting-message-list", ".meeting-chat form"]);
  const videoGridScroll = await page.$eval(".video-grid", (element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  assert(videoGridScroll.scrollHeight > videoGridScroll.clientHeight, "Meeting participants do not scroll in a constrained viewport.");
  await page.click('.meeting-controls button[aria-label="React"]');
  await page.waitForSelector(".meeting-controls .reaction-popover", { visible: true });
  await assertViewport(page, [".meeting-controls .reaction-popover"]);
  await page.click('.meeting-controls button[aria-label="Thumbs up (4)"]');
  await page.waitForSelector(".meeting-reaction", { visible: true });
  await page.screenshot({ path: resolve(artifactDirectory, "iteration-landscape-meeting.png") });
  report("landscape meeting reactions ready");

  await page.evaluate(() => (globalThis as typeof globalThis & { mockSockets: WebSocket[] }).mockSockets.at(-1)?.close());
  await page.waitForSelector(".meeting-overlay", { hidden: true });
  await page.waitForFunction(() => document.querySelector(".connection-state")?.classList.contains("online"));

  await page.click('button[aria-label="Games"]');
  await clickButtonWithText(page, "Play");
  await page.waitForSelector(".stack-game", { visible: true });
  await assertViewport(page, [".stack-game", ".stack-game > header"]);
  const stackScroll = await page.$eval(".stack-content", (element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  assert(stackScroll.scrollHeight <= stackScroll.clientHeight + 1, "Game controls are clipped in a constrained viewport.");
  await page.screenshot({ path: resolve(artifactDirectory, "iteration-landscape-game.png") });
  report("landscape game ready");

  await page.setViewport({ width: 320, height: 568, deviceScaleFactor: 1 });
  await assertViewport(page, [".stack-game", ".stack-game > header", ".stack-content"]);
  await assertFullyContained(page, ".stack-game", [".stack-board", ".stack-sidebar", ".stack-controls"]);
  const portraitStackScroll = await page.$eval(".stack-content", (element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  assert(portraitStackScroll.scrollHeight <= portraitStackScroll.clientHeight + 1, "Game controls require scrolling on a compact portrait screen.");
  await assertTouchUi(page);
  await page.screenshot({ path: resolve(artifactDirectory, "iteration-compact-game.png") });
  report("compact game ready");

  await verifyTouchMap(browser);
  report("touch map ready");

  await page.click('button[aria-label="Close game"]');
  await page.waitForSelector(".stack-game", { hidden: true });
  await page.click('button[aria-label="Build"]');
  await page.waitForSelector(".build-panel", { visible: true });
  const demotedMember = { ...bootstrap.members.find((member) => member.id === bootstrap.currentUserId)!, role: "member" as const };
  await page.evaluate((member) => {
    const socket = (globalThis as typeof globalThis & { mockSockets: Array<{ emit: (event: unknown) => void }> }).mockSockets.at(-1);
    socket?.emit({ type: "presence.changed", member });
  }, demotedMember);
  await page.waitForSelector(".build-panel", { hidden: true });
  assert(!(await page.$('button[aria-label="Build"]')), "Build tools remained available after demotion.");
  report("live role update ready");

  await page.evaluate(() => (globalThis as typeof globalThis & { mockSockets: WebSocket[] }).mockSockets.at(-1)?.close(1008));
  await page.waitForSelector(".auth-card", { visible: true });
  assert(await page.$eval(".auth-error", (element) => element.textContent === "Session expired. Sign in again."), "Expired session did not return to sign in.");
  report("expired session recovery ready");

  assert(browserIssues.length === 0, browserIssues.join("\n"));
  process.stdout.write("Static production UI checks passed at 1440x900, 320x568, and 844x390.\n");
} finally {
  await browser.close();
}

async function verifyTouchMap(targetBrowser: Awaited<ReturnType<typeof puppeteer.launch>>): Promise<void> {
  const touchPage = await targetBrowser.newPage();
  touchPage.setDefaultTimeout(15_000);
  await touchPage.setViewport({ width: 320, height: 568, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await installApplicationTransport(touchPage);
  try {
    await touchPage.goto("http://localhost/", { waitUntil: "domcontentloaded" });
    await touchPage.waitForSelector(".world-canvas canvas", { visible: true });
    await touchPage.waitForFunction(() => document.querySelector(".connection-state")?.classList.contains("online"));
    await new Promise((resolve) => setTimeout(resolve, 300));
    const commandCount = await touchPage.evaluate(() => (globalThis as typeof globalThis & { mockSockets: Array<{ commands: unknown[] }> }).mockSockets.at(-1)?.commands.length ?? 0);
    const canvasPoint = await touchPage.$eval(".world-canvas canvas", (element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await touchPage.touchscreen.tap(canvasPoint.x, canvasPoint.y);
    await touchPage.waitForFunction((start) => {
      const commands = (globalThis as typeof globalThis & { mockSockets: Array<{ commands: Array<{ type: string }> }> }).mockSockets.at(-1)?.commands ?? [];
      return commands.slice(start).some((command) => command.type === "movement.set_destination" || command.type === "movement.approach_user");
    }, {}, commandCount);
  } finally {
    await touchPage.close();
  }
}

async function installApplicationTransport(targetPage: Page): Promise<void> {
  await targetPage.evaluateOnNewDocument("globalThis.__name = (target) => target;");
  await targetPage.evaluateOnNewDocument((workspace) => {
    class ApplicationSocket extends EventTarget {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;
      readyState = ApplicationSocket.CONNECTING;
      floorId = workspace.members.find((member) => member.id === workspace.currentUserId)?.floorId ?? workspace.floors[0]!.id;
      activeMeetingId: string | undefined;
      commands: unknown[] = [];

      constructor(_url: string | URL) {
        super();
        (globalThis as typeof globalThis & { mockSockets: ApplicationSocket[] }).mockSockets.push(this);
        queueMicrotask(() => {
          this.readyState = ApplicationSocket.OPEN;
          this.dispatchEvent(new Event("open"));
          this.emit({ type: "session.ready", userId: workspace.currentUserId, floorId: this.floorId });
          this.emitSnapshot();
        });
      }

      send(source: string): void {
        const command = JSON.parse(source) as { type: string; floorId?: string; meetingId?: string; reaction?: string };
        this.commands.push(command);
        if (command.type === "floor.change" && command.floorId) {
          const nextFloorId = command.floorId;
          queueMicrotask(() => {
            this.floorId = nextFloorId;
            this.emit({ type: "session.ready", userId: workspace.currentUserId, floorId: this.floorId });
            this.emitSnapshot();
          });
        } else if (command.type === "meeting.join" && command.meetingId) {
          const meeting = workspace.meetings.find((candidate) => candidate.id === command.meetingId);
          if (meeting) {
            this.activeMeetingId = meeting.id;
            meeting.status = "live";
            meeting.participantIds = workspace.members.map((member) => member.id);
            this.emit({ type: "meeting.joined", meeting });
          }
        } else if (command.type === "meeting.leave" && command.meetingId) {
          this.activeMeetingId = undefined;
          this.emit({ type: "meeting.left", meetingId: command.meetingId });
        } else if (command.type === "interaction.react" && command.reaction) {
          const meetingId = this.activeMeetingId;
          queueMicrotask(() => this.emit({
            type: "interaction.reaction",
            id: crypto.randomUUID(),
            userId: workspace.currentUserId,
            reaction: command.reaction,
            scope: meetingId
              ? { type: "meeting", meetingId }
              : { type: "floor", floorId: this.floorId },
          }));
        } else if (command.type === "game.start") {
          queueMicrotask(() => this.emit({
            type: "game.state",
            definitionId: "game-stack",
            grid: Array.from({ length: 20 }, (_, row) => Array.from({ length: 10 }, (_, column) =>
              (row === 2 && column >= 4 && column <= 6) || (row === 3 && column === 5) ? 7 : row === 19 && column <= 2 ? 5 : 0,
            )),
            score: 0,
            lines: 0,
            level: 1,
            running: true,
            paused: false,
          }));
        }
      }

      close(code = 1000): void {
        if (this.readyState === ApplicationSocket.CLOSED) {
          return;
        }
        this.readyState = ApplicationSocket.CLOSED;
        this.dispatchEvent(new CloseEvent("close", { code }));
      }

      private emitSnapshot(): void {
        const floor = workspace.floors.find((candidate) => candidate.id === this.floorId)!;
        this.emit({
          type: "world.snapshot",
          tick: 1,
          floorId: this.floorId,
          layoutRevision: workspace.layouts.find((layout) => layout.floorId === this.floorId)?.revision ?? 0,
          players: workspace.members
            .filter((member) => member.online && member.floorId === this.floorId)
            .map((member) => ({
              userId: member.id,
              floorId: this.floorId,
              x: member.position?.x ?? floor.spawn.x,
              y: member.position?.y ?? floor.spawn.y,
              facing: "down",
              availability: member.availability,
              connected: true,
            })),
        });
      }

      private emit(event: unknown): void {
        this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(event) }));
      }
    }

    (globalThis as typeof globalThis & { mockSockets: ApplicationSocket[] }).mockSockets = [];
    Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: ApplicationSocket });
  }, bootstrap);

  await targetPage.setRequestInterception(true);
  targetPage.on("request", (request) => void respondToRequest(request));
}

async function respondToRequest(request: HTTPRequest): Promise<void> {
  const url = new URL(request.url());
  if (url.pathname === "/v1/auth/session") {
    await jsonResponse(request, { user: { id: bootstrap.currentUserId, username: "maya", email: "maya@northstar.studio" } });
    return;
  }
  if (url.pathname === "/v1/bootstrap") {
    await jsonResponse(request, bootstrap);
    return;
  }
  if (url.pathname === "/v1/conversations/direct") {
    const targetUserId = JSON.parse(request.postData() ?? "{}")?.targetUserId as string | undefined;
    await jsonResponse(request, {
      id: "conversation-created",
      name: "Direct message",
      type: "direct",
      participantIds: [bootstrap.currentUserId, targetUserId],
      unread: 0,
    }, 201);
    return;
  }
  const relativePath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const filePath = resolve(distributionDirectory, relativePath);
  if (filePath !== distributionDirectory && !filePath.startsWith(`${distributionDirectory}${sep}`)) {
    await request.abort();
    return;
  }
  try {
    await request.respond({
      status: 200,
      contentType: contentType(filePath),
      body: await readFile(filePath),
    });
  } catch {
    await request.respond({ status: 404, contentType: "text/plain", body: "Not found" });
  }
}

async function jsonResponse(request: HTTPRequest, value: unknown, status = 200): Promise<void> {
  await request.respond({
    status,
    contentType: "application/json",
    body: JSON.stringify(value),
  });
}

function contentType(filePath: string): string {
  const types: Record<string, string> = {
    ".css": "text/css",
    ".html": "text/html",
    ".js": "text/javascript",
  };
  return types[extname(filePath)] ?? "application/octet-stream";
}

async function assertViewport(targetPage: Page, selectors: string[]): Promise<void> {
  const result = await targetPage.evaluate((candidates) => {
    const clipped = candidates.flatMap((selector) => [...document.querySelectorAll(selector)])
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0
          && (rect.left < -1 || rect.top < -1 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1);
      })
      .map((element) => `${element.tagName}.${element.className}`);
    return {
      clipped,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      verticalOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    };
  }, selectors);
  assert(result.clipped.length === 0, `Clipped regions: ${result.clipped.join(", ")}`);
  assert(result.horizontalOverflow <= 1, `Page overflows horizontally by ${result.horizontalOverflow}px.`);
  assert(result.verticalOverflow <= 1, `Page overflows vertically by ${result.verticalOverflow}px.`);
}

async function assertContained(targetPage: Page, containerSelector: string, selectors: string[]): Promise<void> {
  const failures = await targetPage.$eval(containerSelector, (container, candidates) => {
    const containerRect = container.getBoundingClientRect();
    return candidates.flatMap((selector) => [...container.querySelectorAll(selector)])
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < containerRect.left - 1 || rect.right > containerRect.right + 1;
      })
      .map((element) => `${element.tagName}.${element.className}`);
  }, selectors);
  assert(failures.length === 0, `Panel controls overflow: ${failures.join(", ")}`);
}

async function assertFullyContained(targetPage: Page, containerSelector: string, selectors: string[]): Promise<void> {
  const failures = await targetPage.$eval(containerSelector, (container, candidates) => {
    const containerRect = container.getBoundingClientRect();
    return candidates.flatMap((selector) => [...container.querySelectorAll(selector)])
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < containerRect.left - 1
          || rect.top < containerRect.top - 1
          || rect.right > containerRect.right + 1
          || rect.bottom > containerRect.bottom + 1;
      })
      .map((element) => `${element.tagName}.${element.className}`);
  }, selectors);
  assert(failures.length === 0, `Controls overflow their region: ${failures.join(", ")}`);
}

async function assertTouchUi(targetPage: Page): Promise<void> {
  const result = await targetPage.evaluate(() => {
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const undersized = [...document.querySelectorAll("button, select, input, a[href]")]
      .filter((element) => visible(element) && !element.classList.contains("sr-only"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width < 24 || rect.height < 24;
      })
      .map((element) => `${element.tagName}.${element.className}`);
    const smallTextFields = [...document.querySelectorAll('input:not([type="file"]):not([type="hidden"]), textarea')]
      .filter(visible)
      .filter((element) => Number.parseFloat(getComputedStyle(element).fontSize) < 16)
      .map((element) => `${element.tagName}.${element.className}`);
    return { undersized, smallTextFields };
  });
  assert(result.undersized.length === 0, `Compact controls are too small: ${result.undersized.join(", ")}`);
  assert(result.smallTextFields.length === 0, `Compact text fields are too small: ${result.smallTextFields.join(", ")}`);
}

async function clickButtonWithText(targetPage: Page, text: string): Promise<void> {
  const clicked = await targetPage.evaluate((label) => {
    const button = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === label);
    button?.click();
    return Boolean(button);
  }, text);
  assert(clicked, `${text} button was not found.`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function report(stage: string): void {
  process.stdout.write(`${stage}\n`);
}
