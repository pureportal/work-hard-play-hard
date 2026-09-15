import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createServer } from "node:net";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";
import { chromium, type Page } from "playwright-core";
import { createTestApplication } from "../apps/server/src/testing/application.js";
import { MemoryDatabase } from "../apps/server/src/persistence/memory-database.js";
import type { ClientCommand, MeetingMediaSession, ServerEvent } from "../packages/shared/src/index.js";
import type {} from "./meetings-browser-fixture.js";
import { verifyMeetingUi } from "./meetings-ui-check.js";

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
const source = async (path: string) => transpileModule(await readFile(fileURLToPath(new URL(path, import.meta.url)), "utf8"), {
  compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ESNext },
}).outputText;
const media = await source("../apps/client/src/media-connection.ts");
const fixture = (await source("./meetings-browser-fixture.ts")).replace("../apps/client/src/media-connection", "/media-connection.js");
application.app.get("/media-connection.js", (_request, reply) => reply.type("text/javascript").send(media));
application.app.get("/meeting-fixture.js", (_request, reply) => reply.type("text/javascript").send(fixture));
application.app.get("/meeting-check", (_request, reply) => reply.type("text/html").send('<!doctype html><title>Meeting check</title><script type="module" src="/meeting-fixture.js"></script>'));
await application.app.listen({ host: "127.0.0.1", port });
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const errors: string[] = [];
const checks: string[] = [];

async function login(identifier: string) {
  const context = await browser.newContext({ permissions: ["microphone", "camera"] });
  const response = await context.request.post(`${origin}/v1/auth/login`, { data: { identifier, password: "northstar" } });
  assert.equal(response.status(), 200);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/meeting-check`);
  await page.waitForFunction(() => globalThis.meetingCheck?.events.some((event) => event.type === "session.synced"));
  return page;
}

async function command(page: Page, input: ClientCommand) {
  const after = await page.evaluate((value) => {
    const count = globalThis.meetingCheck.events.length;
    globalThis.meetingCheck.send(value);
    return count;
  }, input);
  const response = await page.waitForFunction(({ input, after }) => globalThis.meetingCheck.events.slice(after).find((event) => {
    if ("requestId" in input && "requestId" in event && input.requestId === event.requestId) return true;
    if (input.type === "meeting.lock") return event.type === "meeting.media_state" && event.session.sessionId === input.sessionId && event.session.locked === input.locked;
    if (input.type === "chat.send") return event.type === "chat.message_created" && event.message.body === input.body && event.message.conversationId === input.conversationId;
    return false;
  }), { input, after }, { timeout: 10_000 });
  return response.jsonValue();
}

async function join(page: Page, meetingId = "meeting-product-crit", invitationId?: string): Promise<MeetingMediaSession> {
  const result = await command(page, { type: "meeting.join", requestId: crypto.randomUUID(), meetingId, ...(invitationId ? { invitationId } : {}) });
  assert.equal(result?.type, "meeting.joined", JSON.stringify(result));
  return page.evaluate(() => globalThis.meetingCheck.connection!.getSnapshot().session);
}

async function connected(page: Page, count: number) {
  await page.waitForFunction((expected) => {
    const remote = globalThis.meetingCheck.connection?.getSnapshot().remote;
    return remote?.size === expected && [...remote.values()].every((peer) => peer.state === "connected");
  }, count, { timeout: 25_000 });
}

async function playing(page: Page, name: "camera" | "screen", participants: number) {
  return page.evaluate(async ({ name, participants }) => {
    const { remote, session } = globalThis.meetingCheck.connection!.getSnapshot();
    const streams = [...remote].filter(([id]) => session.participants.some((participant) => participant.sessionId === id && participant[name]))
      .map(([, peer]) => peer[name]).filter((stream) => stream.getVideoTracks().some((track) => !track.muted));
    if (streams.length !== participants) return false;
    return Promise.all(streams.map((stream) => new Promise<boolean>((resolve) => {
      const video = document.createElement("video");
      video.muted = true;
      video.srcObject = stream;
      document.body.append(video);
      const timeout = setTimeout(() => { video.remove(); resolve(false); }, 5_000);
      video.onplaying = video.onresize = () => {
        if (video.videoWidth <= 16 || video.videoHeight <= 16) return;
        clearTimeout(timeout);
        video.remove();
        resolve(true);
      };
      void video.play().catch(() => { clearTimeout(timeout); video.remove(); resolve(false); });
    }))).then((results) => results.every(Boolean));
  }, { name, participants });
}

try {
  const maya = await login("maya");
  const leo = await login("leo");
  const theo = await login("theo");
  const host = await join(maya);
  const guest = await join(leo);
  const third = await join(theo);
  await Promise.all([maya, leo, theo].map((page) => connected(page, 2)));
  await Promise.all([maya, leo, theo].map((page) => page.evaluate(() => globalThis.meetingCheck.capture())));
  await Promise.all([maya, leo, theo].map((page) => page.waitForFunction(() =>
    [...globalThis.meetingCheck.connection!.getSnapshot().remote.values()].every((peer) => peer.camera.getVideoTracks().some((track) => !track.muted)
      && peer.audio.getAudioTracks().some((track) => !track.muted)))));
  for (const page of [maya, leo, theo]) assert.equal(await playing(page, "camera", 2), true);
  checks.push("Three participants exchange live camera and audio tracks in both directions");

  await maya.evaluate(() => globalThis.meetingCheck.share());
  await leo.waitForFunction(() => [...globalThis.meetingCheck.connection!.getSnapshot().remote.values()].some((peer) => peer.screen.getVideoTracks().some((track) => !track.muted)));
  assert.equal(await playing(leo, "screen", 1), true);
  assert.equal(await playing(leo, "camera", 2), true);
  await leo.waitForFunction((id) => globalThis.meetingCheck.connection!.getSnapshot().remote.get(id)?.audio.getAudioTracks()
    .filter((track) => !track.muted).length === 2, host.sessionId);
  await maya.evaluate(() => globalThis.meetingCheck.stopSharing());
  await leo.waitForFunction(() => globalThis.meetingCheck.connection!.getSnapshot().session.participants.every((participant) => !participant.screen));
  assert(await maya.evaluate(() => globalThis.meetingCheck.streams.microphone!.getAudioTracks()[0]!.readyState === "live"));
  checks.push("Shared video and audio coexist with cameras and microphones and stop independently");

  await command(maya, { type: "meeting.lock", requestId: crypto.randomUUID(), sessionId: host.sessionId, locked: true });
  await command(theo, { type: "meeting.leave", requestId: crypto.randomUUID(), meetingId: third.meetingId, sessionId: third.sessionId });
  const denied = await command(theo, { type: "meeting.join", requestId: crypto.randomUUID(), meetingId: host.meetingId });
  assert.equal(denied?.type === "command.error" && denied.code, "MEETING_LOCKED");
  await command(maya, { type: "meeting.invite", requestId: crypto.randomUUID(), sessionId: host.sessionId, targetUserId: "user-theo" });
  await theo.waitForFunction(() => globalThis.meetingCheck.events.some((event) => event.type === "meeting.invited"));
  const invitationId = await theo.evaluate(() => {
    const event = globalThis.meetingCheck.events.findLast((event) => event.type === "meeting.invited");
    return event?.type === "meeting.invited" ? event.invitation.id : "";
  });
  const rejoined = await join(theo, host.meetingId, invitationId);
  const stale = await command(theo, { type: "meeting.leave", requestId: crypto.randomUUID(), meetingId: third.meetingId, sessionId: third.sessionId });
  assert.equal(stale?.type === "command.error" && stale.code, "MEETING_NOT_JOINED");
  await connected(theo, 2);
  checks.push("Locked entry is denied, an invitation admits its recipient, and an old leave cannot close the new session");

  await command(maya, { type: "chat.send", requestId: crypto.randomUUID(), conversationId: "conversation-daily", body: "Browser meeting check" });
  await Promise.all([leo, theo].map((page) => page.waitForFunction(() => globalThis.meetingCheck.events.some((event) => event.type === "chat.message_created" && event.message.body === "Browser meeting check"))));
  await leo.evaluate(() => globalThis.meetingCheck.socket.close());
  await maya.waitForFunction(() => globalThis.meetingCheck.connection!.getSnapshot().session.participants.length === 2);
  await leo.waitForFunction(() => globalThis.meetingCheck.captures.every((stream) => stream.getTracks().every((track) => track.readyState === "ended")));
  await connected(maya, 1);
  const outsider = await command(theo, { type: "meeting.leave", requestId: crypto.randomUUID(), meetingId: rejoined.meetingId, sessionId: rejoined.sessionId });
  assert.equal(outsider?.type, "meeting.left");
  const blockedChat = await command(theo, { type: "chat.send", requestId: crypto.randomUUID(), conversationId: "conversation-daily", body: "Must not send" });
  assert.equal(blockedChat?.type, "command.error");
  checks.push("Meeting chat reaches participants, access ends on leave, and interrupted connections remove peers and stop capture");

  await leo.reload();
  await leo.waitForFunction(() => globalThis.meetingCheck.events.some((event) => event.type === "session.synced"));
  assert.equal(await leo.evaluate(() => globalThis.meetingCheck.connection === undefined && globalThis.meetingCheck.captures.length === 0), true);
  await command(maya, { type: "meeting.invite", requestId: crypto.randomUUID(), sessionId: host.sessionId, targetUserId: "user-leo" });
  await leo.waitForFunction(() => globalThis.meetingCheck.events.some((event) => event.type === "meeting.invited"));
  const secondInvite = await leo.evaluate(() => (globalThis.meetingCheck.events.findLast((event) => event.type === "meeting.invited") as Extract<ServerEvent, { type: "meeting.invited" }>).invitation.id);
  await join(leo, guest.meetingId, secondInvite);
  await Promise.all([connected(maya, 1), connected(leo, 1)]);
  checks.push("Reconnecting stays out of the meeting until an explicit new join");
  checks.push(...await verifyMeetingUi(browser, application.store, origin));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, errors, limitation: "Synthetic camera/audio and canvas sharing; no hardware noise measurement, OS share chooser or TURN path tested." }, null, 2));
} catch (error) {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      console.error(JSON.stringify(await page.evaluate(async () => ({
        participants: globalThis.meetingCheck?.connection?.getSnapshot().session.participants,
        streams: Object.fromEntries(Object.entries(globalThis.meetingCheck?.streams ?? {}).map(([kind, stream]) => [kind,
          stream.getTracks().map((track) => ({ kind: track.kind, enabled: track.enabled, muted: track.muted, state: track.readyState }))])),
        remote: [...(globalThis.meetingCheck?.connection?.getSnapshot().remote ?? [])].map(([id, peer]) => ({ id, state: peer.state,
          tracks: [peer.camera, peer.audio, peer.screen].map((stream) => stream.getTracks().map((track) => ({ kind: track.kind, enabled: track.enabled, muted: track.muted, state: track.readyState }))) })),
        errors: globalThis.meetingCheck?.events.filter((event) => event.type === "command.error"),
        peers: await Promise.all([...(globalThis.meetingCheck?.connection
          ? (globalThis.meetingCheck.connection as unknown as { peers: Map<string, { connection: RTCPeerConnection }> }).peers : [])].map(async ([id, peer]) => ({
          id,
          transceivers: peer.connection.getTransceivers().map((transceiver) => ({ mid: transceiver.mid, direction: transceiver.currentDirection,
            sending: transceiver.sender.track?.kind, receiving: transceiver.receiver.track.kind })),
          stats: [...(await peer.connection.getStats()).values()].filter((stat) => stat.type === "outbound-rtp" || stat.type === "inbound-rtp")
            .map((stat) => ({ type: stat.type, kind: stat.kind, mid: stat.mid, bytesSent: stat.bytesSent, bytesReceived: stat.bytesReceived, framesDecoded: stat.framesDecoded })),
        }))),
      })), null, 2));
    }
  }
  throw error;
} finally {
  await browser.close();
  await application.app.close();
}
