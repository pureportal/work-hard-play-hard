import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, type Route } from "playwright-core";
import puppeteer from "puppeteer";
import { createOrganisation, createPublicEconomy } from "../packages/shared/src/index.js";
import { createArcadeReviewFixture } from "./arcade-review-fixture.js";

const output = fileURLToPath(new URL("../artifacts/ui-review/", import.meta.url));
await mkdir(output, { recursive: true });
const baseline = process.argv.includes("--baseline");
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const fixture = createArcadeReviewFixture();
const checks: { name: string; source: string; overflow: string[] }[] = [];
const errors: string[] = [];
const revision = String(Date.now());
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
await context.route(/\/src\/.*\.(tsx?|css)(?:\?|$)/, async (route) => {
  const url = new URL(route.request().url());
  url.searchParams.set("review", revision);
  await route.fulfill({ response: await route.fetch({ url: url.toString() }) });
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on("pageerror", (error) => errors.push(error.message));

async function capture(name: string, source = "isolated workspace fixture") {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const overflow = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".side-panel, [role=dialog], .surface-header, .whiteboard-toolbar, .meeting-controls, .auth-card, .call-pill, .knock-pill, .meeting-invitation, .proximity-call, .spotify-song, .work-object-dialog > footer, .meeting-controls > button")]
    .filter((element) => element.getBoundingClientRect().width && element.getBoundingClientRect().height)
    .flatMap((element) => {
      const box = element.getBoundingClientRect();
      const outside = box.left < -1 || box.right > innerWidth + 1 || (!element.closest('.auth-shell') && (box.top < -1 || box.bottom > innerHeight + 1));
      const dialog = element.parentElement?.closest('[role=dialog]')?.getBoundingClientRect();
      const clipped = dialog && (box.left < dialog.left - 1 || box.top < dialog.top - 1 || box.right > dialog.right + 1 || box.bottom > dialog.bottom + 1);
      return outside || clipped || element.scrollWidth > element.clientWidth + 1 ? [`${element.className}: ${JSON.stringify({ x: box.x, y: box.y, width: box.width, height: box.height, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth })}`] : [];
    }));
  checks.push({ name, source, overflow });
  await page.screenshot({ path: `${output}/${baseline ? "before" : "after"}-${name}.png`, animations: "disabled" });
}

async function click(name: string) {
  await page.getByRole("button", { name, exact: true }).click();
}

async function layouts(name: string, source?: string) {
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
    for (const [width, height] of [[1440, 1000], [390, 844], [320, 568], [844, 390]]) {
      await page.setViewportSize({ width: width!, height: height! });
      await capture(`${name}-${theme}-${width}x${height}`, source);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}

const fixtureHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => type => type;
window.__vite_plugin_react_preamble_installed__ = true;
await import('/src/styles.css');
await import('/src/arcade.css');
const entry = await (await fetch('/src/main.tsx')).text();
const dependencies = [...entry.matchAll(/from "([^"]+)"/g)].map(match => match[1]);
const { default: React } = await import(dependencies.find(path => path.includes('/react.js')));
const { default: { createRoot } } = await import(dependencies.find(path => path.includes('/react-dom_client.js')));
let root = createRoot(document.getElementById('root'));
window.reviewMount = async (module, name, values) => {
  root.unmount();
  root = createRoot(document.getElementById('root'));
  const Component = (await import('/src/' + module + '.tsx'))[name];
  const Board = values.board ? (await import('/src/components/WorkObjectDialog.tsx')).WorkObjectDialog : undefined;
  window.reviewCleanup?.();
  window.reviewCleanup = undefined;
  if (name === 'MeetingOverlay' || name === 'ProximityCall') {
    const { MediaConnection } = await import('/src/media-connection.ts');
    values.connection = new MediaConnection({ sessionId: 'review-session', callId: 'review-call', meetingId: values.meeting?.id, hostUserId: values.currentUserId, locked: false, iceServers: [], participants: [{ sessionId: 'review-session', userId: values.currentUserId, microphone: false, camera: false, screen: false }] }, () => true);
    window.reviewCleanup = () => values.connection.close();
  }
  if (name === 'DeferredContent') {
    const Loading = React.lazy(() => new Promise((resolve, reject) => {
      window.reviewResolve = () => resolve({ default: () => React.createElement('p', null, 'Loaded panel') });
      window.reviewReject = () => reject(new Error('Review import failed'));
    }));
    values.children = React.createElement(Loading);
  }
  function Fixture() {
    const [props, setProps] = React.useState(values);
    window.reviewUpdate = patch => setProps(current => ({ ...current, ...patch }));
    const callbacks = Object.fromEntries(Object.entries(props).filter(([key]) => key.startsWith('on')).map(([key]) => [key, async (...args) => {
      window.reviewCalls.push({ key, args });
      if (window.reviewFailure) throw new Error('Could not save. Try again.');
      if (key === 'onViewChange') setProps(current => ({ ...current, small: args[0] }));
      return true;
    }]));
    const element = React.createElement(Component, { ...props, ...callbacks });
    if (Board) return React.createElement('main', { className: 'workspace-shell' }, element, React.createElement(Board, { title: 'Meeting whiteboard', modal: false, state: props.board, onUpdate: async () => {}, onClose: () => {} }));
    if (['MeetingsPanel', 'ChatPanel', 'DeferredContent'].includes(name) && props.sidebar !== false) return React.createElement('main', { className: 'workspace-shell' }, React.createElement('nav'), React.createElement('div'), element);
    return element;
  }
  window.reviewCalls = [];
  window.reviewFailure = false;
  root.render(React.createElement(Fixture));
};
</script></body></html>`;

async function mount(module: string, name: string, props: Record<string, unknown>) {
  await page.evaluate(async ({ module, name, props }) => {
    await (window as unknown as { reviewMount: (module: string, name: string, props: unknown) => Promise<void> }).reviewMount(module, name, props);
  }, { module, name, props });
  await page.locator("#root > *").waitFor();
}

try {
  if (!process.argv.includes("--components")) {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
  await page.locator(".auth-card").waitFor();
  await layouts("live-sign-in", "real running app, unauthenticated");
  await click("Server");
  await capture("live-server-picker", "real running app, unauthenticated");
  await fixture.install(context);
  await context.route(/\/v1\/(spotify|github)(\/|$)/, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/spotify") || path.endsWith("/github")) await route.fulfill({ json: { configured: true, connected: false, sharing: false, needsReconnect: false } });
    else await route.fulfill({ status: 503, json: { error: "Connection unavailable. Try again." } });
  });
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.locator(".world-canvas canvas").waitFor();
  await page.getByRole("button", { name: "Close people", exact: true }).waitFor();
  await layouts("people");
  await page.getByRole("button", { name: "Leo Martins", exact: true }).click();
  await layouts("person-details");
  await click("Invite member");
  await layouts("invite");
  await click("Messages");
  await layouts("messages");
  await click("Meetings");
  await layouts("meetings");
  await click("Organisation");
  await layouts("organisation");
  await click("Settings");
  await page.getByRole("heading", { name: "Registration", exact: true }).waitFor();
  await layouts("settings");
  await page.getByRole("heading", { name: "Kidnapping", exact: true }).scrollIntoViewIfNeeded();
  await layouts("settings-bottom");
  await click("Customize avatar");
  await page.getByRole("dialog", { name: "Avatar", exact: true }).waitFor();
  await layouts("avatar");
  for (const category of ["Face", "Hair", "Tops", "Bottoms", "Shoes", "Headwear"]) {
    await page.getByRole("tab", { name: category, exact: true }).click();
    await page.locator(".character-option").last().scrollIntoViewIfNeeded();
    await capture(`avatar-${category.toLowerCase()}`);
  }
  await page.getByRole("combobox", { name: "Animation", exact: true }).selectOption("sit-listen");
  await page.getByRole("combobox", { name: "Facing direction", exact: true }).selectOption("up");
  await capture("avatar-preview-options");
  await page.keyboard.press("Escape");
  await click("Build");
  await click("Personal");
  await layouts("personal-build");
  await click("Shared");
  await layouts("shared-build");
  await click("Room access");
  await layouts("room-access");
  await click("Back to build");
  await click("Funds & votes");
  for (const tab of ["Votes", "Donate", "Shared items", "Activity", "Settings"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await page.setViewportSize({ width: 320, height: 568 });
    await capture(`funds-${tab.toLowerCase().replaceAll(" ", "-")}`);
  }
  }

  await context.route(/\/v1\/(spotify|github)(\/|$)/, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/spotify") || path.endsWith("/github")) await route.fulfill({ json: { configured: true, connected: false, sharing: false, needsReconnect: false } });
    else await route.fulfill({ status: 503, json: { error: "Connection unavailable. Try again." } });
  });

  await context.route("**/__ui-review", (route) => route.fulfill({ contentType: "text/html", body: fixtureHtml }));
  await page.goto("http://127.0.0.1:5173/__ui-review");
  await page.waitForFunction(() => "reviewMount" in window);
  const bootstrap = fixture.store.getBootstrap("user-maya");
  const members = bootstrap.members;
  await mount("components/MeetingOverlay", "MeetingOverlay", { meeting: bootstrap.meetings[0], members, currentUserId: "user-maya", messages: [], small: false, muted: true, cameraOn: false, leaving: false, reactions: [], assets: [], onOpenAsset: true, onInvite: true, onLock: true, onMutedChange: true, onCameraChange: true, onReact: true, onSendMessage: true, onViewChange: true, onLeave: true });
  await layouts("meeting", "isolated component fixture");
  for (const width of [701, 730, 760]) {
    await page.setViewportSize({ width, height: 600 });
    const chat = page.getByRole("tab", { name: "Chat", exact: true });
    await chat.focus();
    await page.keyboard.press("Home");
    assert.equal(await page.getByRole("tab", { name: "Video", exact: true }).getAttribute("aria-selected"), "true");
    await page.keyboard.press("End");
    assert.equal(await chat.getAttribute("aria-selected"), "true");
    await capture(`meeting-chat-${width}`, "isolated component fixture");
  }
  await click("Meeting settings");
  await layouts("meeting-settings", "isolated component fixture");
  await click("Minimize meeting");
  await layouts("meeting-minimized", "isolated component fixture");
  await mount("components/MeetingOverlay", "MeetingOverlay", { meeting: bootstrap.meetings[0], members, currentUserId: "user-maya", messages: [], small: true, muted: true, cameraOn: false, leaving: false, reactions: [], assets: [], onOpenAsset: true, onInvite: true, onLock: true, onMutedChange: true, onCameraChange: true, onReact: true, onSendMessage: true, onViewChange: true, onLeave: true, board: { kind: "whiteboard", revision: 0, document: { text: "", cards: [] } } });
  await layouts("meeting-whiteboard", "isolated component fixture");
  await click("Sticky note");
  await layouts("meeting-whiteboard-editor", "isolated component fixture");
  for (const [width, height] of [[844, 390], [667, 375], [568, 320], [320, 568]]) {
    await page.setViewportSize({ width: width!, height: height! });
    const title = page.getByRole("textbox", { name: "Title", exact: true });
    await title.fill("Meeting notes");
    assert(await title.evaluate((input) => {
      const box = input.getBoundingClientRect();
      const editor = input.closest('.whiteboard-card-editor')!.getBoundingClientRect();
      return box.top >= editor.top && box.bottom <= editor.bottom;
    }), `Whiteboard title must be visible at ${width}x${height}`);
    await capture(`meeting-whiteboard-editing-${width}x${height}`, "isolated component fixture");
  }
  await mount("components/WorkObjectDialog", "WorkObjectDialog", { title: "Release checklist", state: { kind: "checklist", revision: 0, items: Array.from({ length: 12 }, (_, index) => ({ id: String(index), text: `Review the release item ${index + 1}`, completed: index < 4 })) }, onUpdate: true, onClose: true });
  await layouts("checklist", "isolated component fixture");
  await page.getByRole("textbox", { name: "New item" }).fill("Prepare release");
  await page.evaluate(() => (window as unknown as { reviewFailure: boolean }).reviewFailure = true);
  await click("Add");
  await page.getByRole("alert").waitFor();
  await capture("checklist-save-error", "isolated component fixture");
  await click("Close board");
  await capture("checklist-discard", "isolated component fixture");

  await mount("components/WorkObjectDialog", "WorkObjectDialog", { title: "Planning whiteboard", state: { kind: "whiteboard", revision: 0, document: { text: "", cards: [] } }, onUpdate: true, onClose: true });
  await layouts("whiteboard-empty", "isolated component fixture");
  await click("Sticky note");
  await layouts("whiteboard-editor", "isolated component fixture");
  await click("Board");
  await layouts("whiteboard-board", "isolated component fixture");
  await click("Image");
  await layouts("whiteboard-image", "isolated component fixture");
  await click("Notes");
  await page.getByRole("textbox", { name: "Notes", exact: true }).fill("Review release notes");
  await layouts("whiteboard-notes", "isolated component fixture");
  await page.getByText("Saved", { exact: true }).waitFor();
  await capture("whiteboard-saved", "isolated component fixture");

  await mount("components/permissions/RoomPermissionsPanel", "RoomPermissionsPanel", { floors: bootstrap.floors, layouts: bootstrap.layouts, currentFloorId: "floor-studio", currentUser: members.find((member) => member.id === "user-maya"), members, organisation: { ...createOrganisation(), ceoIds: ["user-maya"] }, publicEconomy: createPublicEconomy("hierarchical"), settings: bootstrap.gameSettings, pending: false, onSaveRoom: true, onSaveDefaults: true, onBack: true, onClose: true });
  await layouts("room-permissions", "isolated component fixture");
  await page.getByRole("tab", { name: "Defaults", exact: true }).click();
  await layouts("room-defaults", "isolated component fixture");

  await mount("github/GitHubMailroom", "GitHubMailroom", { object: { id: "tray", variantId: "mint" }, repository: "", onRepositoryChange: true, onClose: true });
  await layouts("github-tray", "isolated component fixture");
  await click("Connect GitHub");
  await page.getByRole("alert").waitFor();
  await capture("github-error", "isolated component fixture");

  await mount("components/AuthScreen", "AuthScreen", { registrationsEnabled: true, invitationRequired: true, magicLinkEnabled: true, setupRequired: false, corporateIdentity: bootstrap.corporateIdentity, onAuthenticated: true, onServerChanged: true });
  await page.getByRole("tab", { name: "Create account", exact: true }).click();
  await layouts("registration", "isolated component fixture");
  await page.getByRole("tab", { name: "Create account", exact: true }).focus();
  await page.keyboard.press("Home");
  assert.equal(await page.getByRole("tab", { name: "Sign in", exact: true }).getAttribute("aria-selected"), "true");
  await click("Email sign-in link");
  await layouts("magic-link", "isolated component fixture");
  await context.route("**/v1/auth/magic-link", (route) => route.fulfill({ json: {} }));
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("review@example.test");
  await click("Send sign-in link");
  await capture("magic-link-sent", "isolated component fixture");

  await mount("components/AuthScreen", "AuthScreen", { registrationsEnabled: true, invitationRequired: false, magicLinkEnabled: false, setupRequired: true, corporateIdentity: bootstrap.corporateIdentity, onAuthenticated: true });
  await layouts("initial-setup", "isolated component fixture");

  await mount("components/MeetingsPanel", "MeetingsPanel", { meetings: [], rooms: [], members, onClose: true, onJoin: true });
  await layouts("meetings-empty", "isolated component fixture");
  await mount("components/ChatPanel", "ChatPanel", { conversations: bootstrap.conversations.slice(0, 1), messages: [], members, currentUserId: "user-maya", onConversationChange: true, onSend: true, onSendImage: true, onClose: true });
  await layouts("messages-empty", "isolated component fixture");

  await mount("components/CallNotice", "CallNotice", { peer: members[1], call: { callId: "review", peerUserId: members[1]!.id, direction: "incoming", state: "ringing" }, onRespond: true, onEnd: true });
  await layouts("incoming-call", "isolated component fixture");
  await mount("components/RoomKnockNotice", "RoomKnockNotice", { requester: members[1], room: bootstrap.layouts[0]!.rooms[0], knock: { id: "knock" }, onRespond: true });
  await layouts("room-knock", "isolated component fixture");
  await mount("components/MeetingInvitationNotice", "MeetingInvitationNotice", { inviter: members[1], meeting: bootstrap.meetings[0], invitation: { expiresAt: new Date(Date.now() + 600_000).toISOString() }, onOpen: true, onDismiss: true });
  await layouts("meeting-invitation", "isolated component fixture");
  await mount("components/ProximityCall", "ProximityCall", { currentUserId: "user-maya", members, muted: true, cameraOn: false, onMutedChange: true, onCameraChange: true, onLeave: true, onError: true });
  await layouts("proximity-call", "isolated component fixture");

  let emptyTray = false;
  let failedTray = false;
  await context.route("**/v1/github", (route) => route.fulfill({ json: { configured: true, connected: true, login: "review", installationUrl: null } }));
  await context.route("**/v1/github/repositories?*", (route) => route.fulfill({ json: { repositories: [{ fullName: "team/project", private: true }], nextPage: null } }));
  await context.route("**/v1/github/trays/*", (route) => route.fulfill({ status: failedTray ? 503 : 200, json: failedTray ? { error: "Could not load pull requests. Try again." } : { repository: { fullName: "team/project", private: true }, total: emptyTray ? 0 : 12, nextCursor: null, pullRequests: emptyTray ? [] : Array.from({ length: 12 }, (_, index) => ({ number: index + 1, title: "Make the workspace easier to use on small screens", url: `https://github.com/team/project/pull/${index + 1}`, author: "review", state: "OPEN", draft: false, reviewDecision: "REVIEW_REQUIRED", updatedAt: "2026-09-17T09:00:00Z", mergedAt: null })) } }));
  await mount("github/GitHubMailroom", "GitHubMailroom", { object: { id: "tray" }, repository: "team/project", onRepositoryChange: true, onClose: true });
  await page.getByRole("list", { name: "Pull requests", exact: true }).waitFor();
  await layouts("github-populated", "isolated component fixture");
  emptyTray = true;
  await click("Mine");
  await page.getByText("Tray clear.", { exact: true }).waitFor();
  await capture("github-empty", "isolated component fixture");
  failedTray = true;
  await click("Review requests");
  await page.getByRole("alert").waitFor();
  await capture("github-refresh-error", "isolated component fixture");
  failedTray = false;
  await click("Refresh pull requests");
  await page.getByText("Tray clear.", { exact: true }).waitFor();
  await click("Merged");

  await context.route("**/v1/spotify", (route) => route.fulfill({ json: { configured: true, connected: true, sharing: true, needsReconnect: false, jamUrl: null } }));
  await mount("spotify/SpotifySettings", "SpotifySettings", {});
  await click("Share Jam invite");
  await page.getByRole("textbox", { name: "Jam invite", exact: true }).fill("https://example.test/not-a-jam");
  await click("Share invite");
  await page.getByRole("alert").waitFor();
  await capture("spotify-jam-validation", "isolated component fixture");
  await mount("spotify/SpotifySongDetails", "SpotifySongDetails", { own: false, activity: { userId: "user-leo", trackId: "review-track", title: "A song with a long title for a narrow screen", artist: "Review artist", album: "Review album", trackUrl: "https://open.spotify.com/track/review", artworkUrl: null, jamUrl: null }, onClose: true, onSettings: true });
  await layouts("spotify-song", "isolated component fixture");
  await click("Play on my Spotify");
  await page.getByRole("alert").waitFor();
  await capture("spotify-play-error", "isolated component fixture");

  for (const sidebar of [false, true]) {
    await mount("components/DeferredContent", "DeferredContent", { sidebar, onClose: true });
    await layouts(`deferred-${sidebar ? "sidebar" : "dialog"}`, "isolated component fixture");
    await page.evaluate(() => (window as unknown as { reviewReject: () => void }).reviewReject());
    await page.getByRole("alert").waitFor();
    await capture(`deferred-${sidebar ? "sidebar" : "dialog"}-error`, "isolated component fixture");
  }

  let sessionRequest: Route | undefined;
  await context.route("**/v1/auth/session", (route) => { sessionRequest = route; });
  await mount("App", "App", {});
  await page.getByRole("main", { name: "Loading office", exact: true }).waitFor();
  await capture("workspace-loading", "isolated component fixture");
  assert(sessionRequest);
  await sessionRequest.fulfill({ status: 503, json: { error: "Office unavailable. Try again." } });
  await page.getByRole("button", { name: "Retry", exact: true }).waitFor();
  await layouts("workspace-error", "isolated component fixture");

  const landing = await readFile(new URL("../apps/landing/index.html", import.meta.url), "utf8");
  const landingCss = await readFile(new URL("../apps/landing/src/styles.css", import.meta.url), "utf8");
  await context.route("**/__landing-review", (route) => route.fulfill({ contentType: "text/html", body: landing.replace('<script type="module" src="/src/main.ts"></script>', `<style>${landingCss}</style>`) }));
  await page.goto("http://127.0.0.1:5173/__landing-review");
  await layouts("landing", "isolated static landing fixture; landing service stopped");
} finally {
  await writeFile(`${output}/${baseline ? "baseline" : process.argv.includes("--components") ? "components-results" : "results"}.json`, JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
  fixture.stop();
}
if (!baseline) {
  assert.deepEqual(errors, []);
  assert.deepEqual(checks.filter((check) => check.overflow.length), []);
}
console.log(`${checks.length} layout/state checks captured; ${checks.filter((check) => check.overflow.length).length} overflows; ${errors.length} browser errors.`);
