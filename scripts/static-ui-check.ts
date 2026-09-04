import { mkdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type HTTPRequest, type Page } from "puppeteer";
import { DemoStore } from "../apps/server/src/store.js";

const workspaceDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distributionDirectory = resolve(workspaceDirectory, "apps/client/dist");
const artifactDirectory = resolve(workspaceDirectory, "artifacts");
const bootstrap = new DemoStore().getBootstrap("user-maya");
bootstrap.conversations = bootstrap.conversations.filter((conversation) => conversation.id !== "conversation-jonas");
bootstrap.messages = bootstrap.messages.filter((message) => message.conversationId !== "conversation-jonas");
await mkdir(artifactDirectory, { recursive: true });

const browser = await puppeteer.launch({
  headless: "shell",
  timeout: 120_000,
  protocolTimeout: 120_000,
  args: ["--disable-dev-shm-usage", "--no-first-run", "--no-sandbox"],
});
try {
  const [page] = await browser.pages();
  if (!page) {
    throw new Error("Chromium did not create an initial page.");
  }
  const browserIssues: string[] = [];
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(120_000);
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserIssues.push(`Browser console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => browserIssues.push(`Browser error: ${error.message}`));
  page.on("requestfailed", (request) => browserIssues.push(`Request failed: ${request.url()} ${request.failure()?.errorText ?? "unknown"}`));
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await installApplicationTransport(page);

  await page.goto("http://localhost/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".world-canvas canvas", { visible: true });
  await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
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

  const floorChoiceCommandCount = await page.evaluate(() => (
    (globalThis as typeof globalThis & { mockSockets: Array<{ commands: unknown[] }> })
      .mockSockets.at(-1)?.commands.length ?? 0
  ));
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
  await page.waitForFunction(() => document.querySelector<HTMLSelectElement>(".floor-picker select")?.value === "floor-studio");
  const floorChoiceCommands = await page.evaluate((start) => (
    (globalThis as typeof globalThis & { mockSockets: Array<{ commands: Array<{ type: string }> }> })
      .mockSockets.at(-1)?.commands.slice(start) ?? []
  ), floorChoiceCommandCount);
  assert(!floorChoiceCommands.some((command) => command.type === "movement.set_destination"), "Floor preview started movement.");
  await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
  report("rapid floor choice ready");

  await page.setViewport({ width: 320, height: 568, deviceScaleFactor: 1 });
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    window.dispatchEvent(new Event("offline"));
  });
  await page.waitForSelector(".connection-state.offline", { visible: true });
  await assertViewport(page, [".connection-state.offline", ".connection-tooltip"]);
  const connectionTarget = await page.$eval(".connection-state.offline", (element) => ({
    width: element.getBoundingClientRect().width,
    height: element.getBoundingClientRect().height,
  }));
  assert(connectionTarget.width >= 36 && connectionTarget.height >= 36, "Connection indicator is too small for touch.");
  await page.focus(".connection-state.offline");
  await page.waitForFunction(() => getComputedStyle(document.querySelector(".connection-tooltip")!).opacity === "1");
  assert(await page.$eval(".connection-tooltip", (element) => element.textContent === "Connection Lost"), "Connection tooltip is missing.");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    window.dispatchEvent(new Event("online"));
  });
  await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
  report("compact connection recovery ready");
  await assertTouchUi(page);
  await page.click('button[aria-label="Close people"]');
  await page.waitForSelector(".people-panel", { hidden: true });
  const compactLocation = await page.evaluate(() => {
    const office = document.querySelector<HTMLElement>(".office-name");
    const room = document.querySelector<HTMLElement>(".current-room");
    return {
      officeVisible: office ? getComputedStyle(office).display !== "none" : false,
      roomVisible: room ? getComputedStyle(room).display !== "none" : false,
      roomName: room?.textContent?.trim(),
    };
  });
  assert(
    compactLocation.roomName
      ? compactLocation.roomVisible && !compactLocation.officeVisible
      : compactLocation.officeVisible,
    "Compact top bar did not show the most specific available location.",
  );
  const compactFloorLabel = await page.$eval(".floor-picker-value", (element) => {
    const floorName = element.lastElementChild as HTMLElement;
    return {
      name: floorName.textContent?.trim(),
      clipped: floorName.scrollWidth > floorName.clientWidth + 1,
      levelHidden: getComputedStyle(element.firstElementChild!).display === "none",
    };
  });
  assert(compactFloorLabel.name === "Studio", "Compact floor picker lost the current floor name.");
  assert(!compactFloorLabel.clipped, "Compact floor picker truncates the current floor name.");
  assert(compactFloorLabel.levelHidden, "Compact floor picker did not prioritize the floor name.");
  await page.screenshot({ path: resolve(artifactDirectory, "iteration-compact-office.png") });
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
  await assertViewport(page, [".nav-rail", ".top-bar", ".build-panel"]);
  await assertContained(page, ".build-panel", [".room-control", ".room-control select", ".room-control .icon-button"]);
  assert(!(await page.$(".control-dock")), "Gameplay controls remained visible in Build Mode.");
  const categoryTabs = await page.$eval(".asset-category-tabs", (element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  assert(categoryTabs.scrollWidth <= categoryTabs.clientWidth + 1, "Asset categories overflow the Build panel.");
  assert(await page.$eval(".asset-category-tabs", (element) => element.textContent?.includes("Outdoor") ?? false), "Outdoor assets are missing.");
  await page.screenshot({ path: resolve(artifactDirectory, "iteration-compact-build.png") });
  const categoryTargetHeight = await page.$$eval(".asset-category-tabs button", (buttons) => Math.min(...buttons.map((button) => button.getBoundingClientRect().height)));
  assert(categoryTargetHeight >= 40, "Compact asset categories have undersized touch targets.");
  await page.$eval(".room-control", (room) => {
    (room as HTMLDetailsElement).open = true;
  });
  const roomFieldMetrics = await page.$eval('.room-fields input:not([type="color"])', (input) => ({
    height: input.getBoundingClientRect().height,
    fontSize: Number.parseFloat(getComputedStyle(input).fontSize),
  }));
  assert(roomFieldMetrics.height >= 40, "Compact room fields have undersized touch targets.");
  assert(roomFieldMetrics.fontSize >= 16, "Compact room fields can trigger browser input zoom.");
  await assertTouchUi(page);
  await page.keyboard.press("Escape");
  await page.waitForSelector(".build-panel", { hidden: true });
  assert(await page.$eval('button[aria-label="Build"]', (button) => button.getAttribute("aria-pressed") === "false"), "Escape did not dismiss the Build panel.");
  report("compact build ready");

  await page.click('button[aria-label="People"]');
  await page.click('button[aria-label="Jonas Berg"]');
  await page.click('button[aria-label="Message Jonas Berg"]');
  await page.waitForSelector('input[aria-label="Message Jonas Berg"]', { visible: true });
  await assertViewport(page, [".nav-rail", ".chat-panel", ".message-composer"]);
  await assertContained(page, ".conversation-tabs", ['button[aria-selected="true"]']);
  await assertTouchUi(page);
  await page.screenshot({ path: resolve(artifactDirectory, "iteration-compact-direct-message.png") });
  const selectedConversation = await page.$eval('.conversation-tabs button[aria-selected="true"]', (button) => button.textContent?.trim());
  await page.focus('.conversation-tabs button[aria-selected="true"]');
  await page.keyboard.press("ArrowLeft");
  await page.waitForFunction((previous) => document.querySelector('.conversation-tabs button[aria-selected="true"]')?.textContent?.trim() !== previous, {}, selectedConversation);
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction((expected) => document.querySelector('.conversation-tabs button[aria-selected="true"]')?.textContent?.trim() === expected, {}, selectedConversation);
  report("compact messages ready");

  await page.click('button[aria-label="Meetings"]');
  const meetingActionHeight = await page.$$eval(".meeting-card button", (buttons) => Math.min(...buttons.map((button) => button.getBoundingClientRect().height)));
  assert(meetingActionHeight >= 40, "Compact meeting actions have undersized touch targets.");
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

  const movementCommandCount = await page.evaluate(() => (
    (globalThis as typeof globalThis & { mockSockets: Array<{ commands: unknown[] }> })
      .mockSockets.at(-1)?.commands.length ?? 0
  ));
  await page.click('button[aria-label="Minimize meeting"]');
  await page.waitForSelector(".meeting-overlay-small", { visible: true });
  assert(!(await page.$(".meeting-backdrop")), "Small meeting retained a modal backdrop.");
  assert(!(await page.$(".side-panel")), "Small meeting left a side panel covering the world.");
  await assertViewport(page, [".meeting-overlay-small", ".meeting-overlay-header", ".meeting-controls"]);
  await page.focus(".world-canvas");
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction((start) => {
    const commands = (globalThis as typeof globalThis & { mockSockets: Array<{ commands: Array<{ type: string }> }> })
      .mockSockets.at(-1)?.commands ?? [];
    return commands.slice(start).some((command) => command.type === "movement.input");
  }, {}, movementCommandCount);
  await page.screenshot({ path: resolve(artifactDirectory, "iteration-landscape-meeting-small.png") });

  await page.click('button[aria-label="People"]');
  await page.waitForSelector(".people-panel", { visible: true });
  const firstMember = '.people-panel button[aria-label="Maya Chen (you)"]';
  await page.click(firstMember);
  await page.waitForFunction((selector) => document.querySelector(selector)?.getAttribute("aria-expanded") === "true", {}, firstMember);
  await page.click('button[aria-label="Close people"]');
  await page.waitForSelector(".people-panel", { hidden: true });

  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="Expand meeting"]');
    if (!button) {
      throw new Error("Expand meeting button is missing.");
    }
    button.click();
  });
  await page.waitForSelector(".meeting-backdrop", { visible: true });
  report("small meeting movement ready");

  await page.evaluate(() => (globalThis as typeof globalThis & { mockSockets: WebSocket[] }).mockSockets.at(-1)?.close());
  await page.waitForSelector(".meeting-overlay", { hidden: true });
  await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");

  await page.evaluate(() => {
    const socket = (globalThis as typeof globalThis & { mockSockets: Array<{ emit: (event: unknown) => void }> }).mockSockets.at(-1);
    socket?.emit({
      type: "game.lobby_updated",
      lobby: {
        definitionId: "game-tetris",
        objectId: "object-tetris",
        floorId: "floor-studio",
        participantIds: ["user-maya", "user-leo"],
        capacity: 8,
      },
    });
  });
  await page.waitForSelector(".tetris-lobby", { visible: true });
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await clickButtonWithText(page, "Start round");
  await page.waitForSelector(".tetris-game", { visible: true });
  await page.waitForSelector('.tetris-hold [aria-label="Held I piece"]', { visible: true });
  await assertViewport(page, [".tetris-game", ".tetris-game > header", ".tetris-content"]);
  await assertFullyContained(page, ".tetris-game", [".tetris-left-rail", ".tetris-board", ".tetris-sidebar", ".tetris-controls"]);
  const desktopBoard = await page.$eval(".tetris-board", (element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  assert(desktopBoard.width >= 280 && desktopBoard.height >= 560, "The Tetris board did not use the desktop viewport.");
  const animationStyles = await page.evaluate(() => ({
    game: getComputedStyle(document.querySelector(".tetris-game")!).animationName,
    preview: getComputedStyle(document.querySelector(".tetris-piece-preview.has-piece")!).animationName,
    cellTransition: getComputedStyle(document.querySelector(".tetris-cell.is-active")!).transitionDuration,
  }));
  assert(animationStyles.game !== "none" && animationStyles.preview !== "none", "Tetris entry or preview animation is missing.");
  assert(animationStyles.cellTransition !== "0s", "Tetris cell transitions are missing.");

  const simultaneousInputStart = await page.evaluate(() => (
    (globalThis as typeof globalThis & { mockSockets: Array<{ commands: unknown[] }> })
      .mockSockets.at(-1)?.commands.length ?? 0
  ));
  await page.keyboard.down("ArrowLeft");
  await page.waitForFunction((start) => {
    const commands = (globalThis as typeof globalThis & { mockSockets: Array<{ commands: Array<{ type: string; command?: string }> }> })
      .mockSockets.at(-1)?.commands.slice(start) ?? [];
    return commands.some((command) => command.type === "game.command" && command.command === "left");
  }, {}, simultaneousInputStart);
  await new Promise((resolve) => setTimeout(resolve, 60));
  await page.keyboard.press("ArrowUp");
  await new Promise((resolve) => setTimeout(resolve, 260));
  await page.keyboard.up("ArrowLeft");
  const simultaneousInputCommands = await page.evaluate((start) => (
    (globalThis as typeof globalThis & { mockSockets: Array<{ commands: Array<{ type: string; command?: string }> }> })
      .mockSockets.at(-1)?.commands.slice(start)
      .filter((command) => command.type === "game.command")
      .map((command) => command.command) ?? []
  ), simultaneousInputStart);
  const rotationIndex = simultaneousInputCommands.indexOf("rotate");
  assert(simultaneousInputCommands[0] === "left", "Horizontal input was not dispatched immediately.");
  assert(rotationIndex > 0, "Rotation was not dispatched while moving sideways.");
  assert(
    simultaneousInputCommands.some((command, index) => command === "left" && index > rotationIndex),
    `Horizontal repeat stopped after rotation: ${JSON.stringify(simultaneousInputCommands)}`,
  );

  await page.keyboard.press("c");
  await page.waitForFunction(() => (document.querySelector('.tetris-controls button:nth-child(5)') as HTMLButtonElement | null)?.disabled === true);
  await page.waitForSelector('.tetris-hold [aria-label="Held T piece"]', { visible: true });
  const firstHoldCount = await page.evaluate(() => (
    (globalThis as typeof globalThis & { mockSockets: Array<{ commands: Array<{ type: string; command?: string }> }> })
      .mockSockets.at(-1)?.commands.filter((command) => command.type === "game.command" && command.command === "hold").length ?? 0
  ));
  await page.keyboard.press("c");
  await new Promise((resolve) => setTimeout(resolve, 50));
  const blockedHoldCount = await page.evaluate(() => (
    (globalThis as typeof globalThis & { mockSockets: Array<{ commands: Array<{ type: string; command?: string }> }> })
      .mockSockets.at(-1)?.commands.filter((command) => command.type === "game.command" && command.command === "hold").length ?? 0
  ));
  assert(blockedHoldCount === firstHoldCount, "Hold was dispatched twice before a piece locked.");
  await page.keyboard.press("Space");
  await page.waitForFunction(() => (document.querySelector('.tetris-controls button:nth-child(5)') as HTMLButtonElement | null)?.disabled === false);
  await page.keyboard.press("c");
  await page.waitForFunction((previousCount) => {
    const commands = (globalThis as typeof globalThis & { mockSockets: Array<{ commands: Array<{ type: string; command?: string }> }> })
      .mockSockets.at(-1)?.commands ?? [];
    return commands.filter((command) => command.type === "game.command" && command.command === "hold").length > previousCount;
  }, {}, firstHoldCount);
  await page.waitForSelector('.tetris-hold [aria-label="Held O piece"]', { visible: true });
  await page.screenshot({ path: resolve(artifactDirectory, "iteration-desktop-game.png") });
  report("desktop game input and hold ready");

  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
  await assertViewport(page, [".tetris-game", ".tetris-game > header"]);
  await assertFullyContained(page, ".tetris-game", [".tetris-left-rail", ".tetris-board", ".tetris-sidebar", ".tetris-controls"]);
  const tetrisScroll = await page.$eval(".tetris-content", (element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  assert(tetrisScroll.scrollHeight <= tetrisScroll.clientHeight + 1, "Game controls are clipped in a constrained viewport.");
  await page.screenshot({ path: resolve(artifactDirectory, "iteration-landscape-game.png") });
  report("landscape game ready");

  await page.setViewport({ width: 320, height: 568, deviceScaleFactor: 1 });
  await assertViewport(page, [".tetris-game", ".tetris-game > header", ".tetris-content"]);
  await assertFullyContained(page, ".tetris-game", [".tetris-left-rail", ".tetris-board", ".tetris-sidebar", ".tetris-controls"]);
  const portraitTetrisScroll = await page.$eval(".tetris-content", (element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  assert(portraitTetrisScroll.scrollHeight <= portraitTetrisScroll.clientHeight + 1, "Game controls require scrolling on a compact portrait screen.");
  await assertTouchUi(page);
  await page.screenshot({ path: resolve(artifactDirectory, "iteration-compact-game.png") });
  report("compact game ready");

  await page.click('button[aria-label="Close game"]');
  await page.waitForSelector(".tetris-game", { hidden: true });

  await verifyTouchMap(page);
  report("touch map ready");

  if (!(await page.$(".build-panel"))) {
    await page.click('button[aria-label="Build"]');
  }
  await page.waitForSelector(".build-panel", { visible: true });
  const demotedMember = {
    ...bootstrap.members.find((member) => member.id === bootstrap.currentUserId)!,
    role: "member" as const,
    permissions: [],
  };
  await page.evaluate((member) => {
    const socket = (globalThis as typeof globalThis & { mockSockets: Array<{ emit: (event: unknown) => void }> }).mockSockets.at(-1);
    socket?.emit({ type: "presence.changed", member });
  }, demotedMember);
  await page.waitForSelector(".build-panel:not(.player-build-panel)", { hidden: true });
  await page.waitForSelector(".player-build-panel", { visible: true });
  assert(await page.$('button[aria-label="Build"]'), "Personal build tools disappeared after demotion.");
  report("live role update ready");

  await page.evaluate(() => (globalThis as typeof globalThis & { mockSockets: WebSocket[] }).mockSockets.at(-1)?.close(4_401));
  await page.waitForSelector(".auth-card", { visible: true });
  assert(await page.$eval(".auth-error", (element) => element.textContent === "Session expired. Sign in again."), "Expired session did not return to sign in.");
  report("expired session recovery ready");

  assert(browserIssues.length === 0, browserIssues.join("\n"));
  process.stdout.write("Static production UI checks passed at 1440x900, 320x568, and 844x390.\n");
} finally {
  await browser.close();
}

async function verifyTouchMap(touchPage: Page): Promise<void> {
  touchPage.setDefaultTimeout(15_000);
  touchPage.setDefaultNavigationTimeout(120_000);
  await touchPage.setViewport({ width: 320, height: 568, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await touchPage.goto("http://localhost/", { waitUntil: "domcontentloaded" });
  await touchPage.waitForSelector(".world-canvas canvas", { visible: true });
  await touchPage.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
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
      bufferedAmount = 0;
      floorId = workspace.members.find((member) => member.id === workspace.currentUserId)?.floorId ?? workspace.floors[0]!.id;
      activeMeetingId: string | undefined;
      commands: unknown[] = [];
      heartbeatTimer: number | undefined;
      gameState: {
        type: string;
        roundId: string;
        definitionId: string;
        grid: number[][];
        score: number;
        lines: number;
        level: number;
        running: boolean;
        paused: boolean;
        activePiece: string;
        activeCells: Array<{ row: number; column: number }>;
        ghostCells: Array<{ row: number; column: number }>;
        heldPiece: string | null;
        nextPieces: string[];
        canHold: boolean;
      } | undefined;

      constructor(_url: string | URL) {
        super();
        (globalThis as typeof globalThis & { mockSockets: ApplicationSocket[] }).mockSockets.push(this);
        queueMicrotask(() => {
          this.readyState = ApplicationSocket.OPEN;
          this.dispatchEvent(new Event("open"));
          this.emit({ type: "session.ready", userId: workspace.currentUserId, floorId: this.floorId });
          this.emitSnapshot();
          this.emit({ type: "workspace.snapshot", data: workspace });
          this.emit({ type: "session.synced" });
          this.heartbeatTimer = window.setInterval(() => this.emitSnapshot(), 5_000);
        });
      }

      send(source: string): void {
        const command = JSON.parse(source) as { type: string; floorId?: string; meetingId?: string; reaction?: string; command?: string };
        this.commands.push(command);
        if (command.type === "meeting.join" && command.meetingId) {
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
          queueMicrotask(() => {
            const roundId = "round-static";
            this.emit({
              type: "game.round_started",
              round: {
                id: roundId,
                definitionId: "game-tetris",
                floorId: this.floorId,
                startedAt: new Date().toISOString(),
                status: "playing",
                participants: [
                  { userId: workspace.currentUserId, score: 0, lines: 0, level: 1, status: "playing" },
                  { userId: "user-leo", score: 0, lines: 0, level: 1, status: "playing" },
                ],
              },
            });
            this.gameState = {
              type: "game.state",
              roundId,
              definitionId: "game-tetris",
              grid: Array.from({ length: 20 }, (_, row) => Array.from({ length: 10 }, (_, column) =>
                (row === 2 && column === 4) || (row === 3 && column >= 3 && column <= 5) ? 3 : row === 19 && column <= 2 ? 6 : 0,
              )),
              score: 0,
              lines: 0,
              level: 1,
              running: true,
              paused: false,
              activePiece: "T",
              activeCells: [
                { row: 2, column: 4 },
                { row: 3, column: 3 },
                { row: 3, column: 4 },
                { row: 3, column: 5 },
              ],
              ghostCells: [
                { row: 18, column: 4 },
                { row: 19, column: 3 },
                { row: 19, column: 4 },
                { row: 19, column: 5 },
              ],
              heldPiece: "I",
              nextPieces: ["O", "S", "J", "L", "Z"],
              canHold: true,
            };
            this.emit(this.gameState);
          });
        } else if (command.type === "game.command" && command.command === "hold" && this.gameState?.canHold) {
          const nextPieces = this.gameState.heldPiece
            ? this.gameState.nextPieces
            : this.gameState.nextPieces.slice(1);
          this.gameState = {
            ...this.gameState,
            activePiece: this.gameState.heldPiece ?? this.gameState.nextPieces[0]!,
            heldPiece: this.gameState.activePiece,
            nextPieces,
            canHold: false,
          };
          queueMicrotask(() => this.emit(this.gameState));
        } else if (command.type === "game.command" && command.command === "drop" && this.gameState) {
          this.gameState = {
            ...this.gameState,
            activePiece: this.gameState.nextPieces[0] ?? "I",
            nextPieces: [...this.gameState.nextPieces.slice(1), "I"],
            canHold: true,
          };
          queueMicrotask(() => this.emit(this.gameState));
        }
      }

      close(code = 1000): void {
        if (this.readyState === ApplicationSocket.CLOSED) {
          return;
        }
        window.clearInterval(this.heartbeatTimer);
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
  if (request.method() === "OPTIONS" && url.pathname.startsWith("/v1/")) {
    await request.respond({
      status: 204,
      headers: {
        ...corsHeaders(request),
        "access-control-allow-headers": request.headers()["access-control-request-headers"] ?? "content-type",
        "access-control-allow-methods": request.headers()["access-control-request-method"] ?? "GET, POST",
      },
    });
    return;
  }
  if (url.pathname === "/v1/auth/session") {
    await jsonResponse(request, {
      user: { id: bootstrap.currentUserId, username: "maya", email: "maya@northstar.studio" },
      setupRequired: false,
      registration: {
        enabled: bootstrap.registrationSettings?.enabled ?? false,
        invitationRequired: bootstrap.registrationSettings?.invitationRequired ?? true,
      },
    });
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
    headers: corsHeaders(request),
    body: JSON.stringify(value),
  });
}

function corsHeaders(request: HTTPRequest): Record<string, string> {
  const origin = request.headers().origin;
  return origin
    ? {
      "access-control-allow-credentials": "true",
      "access-control-allow-origin": origin,
    }
    : {};
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
        const target = element.closest("label") ?? element;
        const { offsetWidth, offsetHeight } = target as HTMLElement;
        return offsetWidth < 40 || offsetHeight < 40;
      })
      .map((element) => `${element.tagName}.${element.className}`);
    const smallTextFields = [...document.querySelectorAll('input:not([type="file"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="color"]), textarea')]
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
