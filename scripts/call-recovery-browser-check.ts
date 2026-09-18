import assert from "node:assert/strict";
import type { Page } from "playwright-core";

export async function verifyCallRecovery(pages: Page[]) {
  const answerer = (await Promise.all(pages.map(async (page) => ({ page, answerer: await page.evaluate(() =>
    openCallPeers.some((peer) => peer.connectionState === "connected" && peer.localDescription?.type === "answer"))
  })))).find((participant) => participant.answerer)?.page;
  assert(answerer, "A connected answering peer is required to verify ICE recovery.");
  const sockets = await Promise.all(pages.map((page) => page.evaluateHandle(() => openCallSocket)));
  const originalOffer = await answerer.evaluate(() => {
    const peer = openCallPeers.find((candidate) => candidate.connectionState === "connected")!;
    if (!peer.getConfiguration().iceServers?.length) throw new Error("Call has no ICE servers.");
    const description = peer.remoteDescription!.sdp;
    Object.defineProperty(peer, "iceConnectionState", { configurable: true, value: "failed" });
    peer.dispatchEvent(new Event("iceconnectionstatechange"));
    Reflect.deleteProperty(peer, "iceConnectionState");
    return description;
  });
  await answerer.waitForFunction((previous) => openCallPeers.some((peer) =>
    peer.connectionState === "connected" && peer.signalingState === "stable" && peer.remoteDescription?.sdp !== previous
  ), originalOffer);

  await answerer.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".world-canvas canvas")!;
    const gl = canvas.getContext("webgl2")!;
    const extension = gl.getExtension("WEBGL_lose_context")!;
    canvas.dataset.testContextRestored = "false";
    canvas.addEventListener("webglcontextrestored", () => { canvas.dataset.testContextRestored = "true"; }, { once: true });
    canvas.addEventListener("webglcontextlost", () => window.setTimeout(() => extension.restoreContext(), 100), { once: true });
    extension.loseContext();
  });
  await answerer.waitForFunction(() => document.querySelector<HTMLCanvasElement>(".world-canvas canvas")?.dataset.testContextRestored === "true");

  for (const [index, page] of pages.entries()) {
    const received = await page.evaluate(async () => {
      const peer = openCallPeers.find((candidate) => candidate.connectionState === "connected")!;
      const stats = [...(await peer.getStats()).values()].filter((report) => report.type === "inbound-rtp");
      return Object.fromEntries(stats.map((report) => [report.id, report.bytesReceived]));
    });
    await page.waitForFunction(async (previous) => {
      const peers = openCallPeers.filter((peer) => peer.connectionState !== "closed");
      if (peers.length !== 1 || peers[0]!.connectionState !== "connected") return false;
      const stats = [...(await peers[0]!.getStats()).values()].filter((report) => report.type === "inbound-rtp");
      return ["audio", "video"].every((kind) => stats.some((report) =>
        report.kind === kind && report.bytesReceived > (previous[report.id] ?? 0)));
    }, received);
    assert(await page.evaluate((socket) => socket === openCallSocket && socket.readyState === WebSocket.OPEN, sockets[index]!));
    await sockets[index]!.dispose();
  }
}
