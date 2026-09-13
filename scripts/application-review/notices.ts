import { chromium } from "playwright-core";
import type { ServerEvent, WorldPlayer } from "../../packages/shared/src/index.js";
import { createRecorder } from "./capture.js";
import { createReviewFixture } from "./fixture.js";

const review = createRecorder(`../../artifacts/application-design-review/${process.env.REVIEW_PHASE ?? "before"}/notices`);
const browser = await chromium.launch({ channel: "msedge", headless: true });

try {
  for (const [width, height] of [[1440, 1000], [390, 844], [320, 568], [844, 390]]) {
    for (const theme of ["light", "dark"] as const) {
      const fixture = await createReviewFixture();
      const context = await browser.newContext({ viewport: { width: width!, height: height! }, colorScheme: theme });
      await fixture.install(context, "maya");
      const page = await context.newPage();
      review.observe(page);
      const prefix = `${width}-${theme}`;
      try {
        await page.goto("http://127.0.0.1:5173");
        await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
        const close = page.getByRole("button", { name: "Close people", exact: true });
        if (await close.count()) await close.click();
        fixture.runtime.stop();
        for (const type of ["call.respond", "call.end", "room.knock_respond", "kidnapping.stop"] as const) fixture.ignoredCommands.add(type);
        const emit = (event: ServerEvent) => fixture.sockets.get("user-maya")!.send(JSON.stringify(event));
        for (const direction of ["outgoing", "incoming"] as const) {
          emit({ type: "call.state", callId: `review-${direction}`, peerUserId: "user-leo", direction, state: "ringing" });
          await page.locator(".call-pill").waitFor();
          await review.capture(page, `${prefix}-call-${direction}`);
          const action = direction === "outgoing" ? "Cancel call to Leo Martins" : "Accept call from Leo Martins";
          await page.getByRole("button", { name: action, exact: true }).click();
          await review.capture(page, `${prefix}-call-${direction}-pending`);
        }
        emit({ type: "call.state", callId: "review-incoming", peerUserId: "user-leo", direction: "incoming", state: "accepted" });
        await review.capture(page, `${prefix}-call-accepted`);
        const knock = { id: "review-knock", roomId: "room-focus", requesterUserId: "user-priya", expiresAt: new Date(Date.now() + 60_000).toISOString() };
        emit({ type: "room.knock_requested", knock });
        await page.locator(".knock-pill").waitFor();
        await review.capture(page, `${prefix}-call-and-knock`);
        await page.locator(".knock-pill .accept-knock").click();
        await review.capture(page, `${prefix}-knock-pending`);
        emit({ type: "room.knock_state", knock, state: "accepted", responderUserId: "user-maya" });
        await page.getByRole("button", { name: "End call with Leo Martins", exact: true }).click();
        emit({ type: "call.state", callId: "review-incoming", peerUserId: "user-leo", direction: "incoming", state: "ended" });
        await page.locator(".call-pill").waitFor({ state: "hidden" });
        emit({ type: "room.knock_requested", knock: { ...knock, id: "review-decline" } });
        await page.locator(".knock-pill button").last().click();
        emit({ type: "room.knock_state", knock: { ...knock, id: "review-decline" }, state: "declined" });
        const players: WorldPlayer[] = fixture.runtime.serializePlayers().map((player) => ({ ...player, connected: true }));
        const layout = fixture.store.getLayout("floor-studio")!;
        const snapshot = (updated: WorldPlayer[]) => emit({ type: "world.snapshot", tick: Date.now(), floorId: "floor-studio", layoutRevision: layout.revision, players: updated });
        snapshot(players.map((player, index) => index < 5 ? { ...player, proximity: { microphone: false, camera: false, callId: "review-nearby" } } : player));
        await page.locator(".proximity-call").waitFor();
        await review.capture(page, `${prefix}-proximity-group`);
        snapshot(players);
        snapshot(players.map((player) => player.userId === "user-leo" ? { ...player, carriedByUserId: "user-maya" } : player));
        await page.locator(".kidnapping-status").waitFor();
        await review.capture(page, `${prefix}-carrying`);
        await page.getByRole("button", { name: "Put down", exact: true }).click();
        snapshot(players.map((player) => player.userId === "user-maya" ? { ...player, carriedByUserId: "user-leo" } : player));
        await review.capture(page, `${prefix}-carried`);
        await page.getByRole("button", { name: "Get down", exact: true }).click();
        snapshot(players);
        await page.getByLabel("Availability", { exact: true }).selectOption("dnd");
        await review.capture(page, `${prefix}-do-not-disturb`);
        await page.getByLabel("Availability", { exact: true }).selectOption("available");
        await page.locator(".control-dock").getByRole("button", { name: "Turn camera on", exact: true }).click();
        await page.getByText("Allow camera access.", { exact: true }).waitFor();
        await review.capture(page, `${prefix}-camera-denied`);
        emit({ type: "command.error", code: "REVIEW", message: "The layout changed. Try again." });
        await review.capture(page, `${prefix}-toast`);
        await fixture.sockets.get("user-maya")!.close({ code: 4401, reason: "Session expired" });
        await page.getByLabel("Username or email").waitFor();
        await review.capture(page, `${prefix}-session-expired`);
      } catch (error) {
        review.blockers.push(`${prefix}: ${String(error)}`);
        await review.capture(page, `${prefix}-failure`);
        console.error(String(error));
      } finally {
        await context.close();
        await fixture.stop();
        await review.save();
      }
    }
  }
} finally {
  await browser.close();
  await review.save();
}
