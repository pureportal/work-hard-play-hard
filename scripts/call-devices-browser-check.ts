import assert from "node:assert/strict";
import { resolve } from "node:path";
import type { Page } from "playwright-core";
import type {} from "./open-calls-browser-check.js";

async function setDevices(page: Page, microphone: "available" | "missing" | "blocked", camera: "available" | "missing" | "blocked") {
  await page.evaluate(({ microphone, camera }) => {
    openCallDevices = { microphone, camera };
    navigator.mediaDevices.dispatchEvent(new Event("devicechange"));
  }, { microphone, camera });
}

async function selectDevices(page: Page, selector: string) {
  const panel = page.locator(selector);
  await panel.getByRole("button", { name: selector === ".proximity-call" ? "Call settings" : "Meeting settings" }).click();
  await page.waitForFunction((selector) => [...document.querySelectorAll<HTMLSelectElement>(`${selector} .media-device-settings select`)]
    .every((select) => [...select.options].some((option) => option.value && option.value !== "default")), selector);
  for (const label of ["Microphone", "Camera"]) {
    const select = panel.getByRole("combobox", { name: label, exact: true });
    const value = await select.evaluate((element: HTMLSelectElement) => [...element.options].find((option) => option.value && option.value !== "default")!.value);
    await select.selectOption(value);
  }
}

async function mediaReceived(page: Page, selector: string, videoCount: number) {
  await page.waitForFunction(({ selector, videoCount }) => {
    const peers = openCallPeers.filter((peer) => peer.connectionState !== "closed");
    const videos = [...document.querySelectorAll<HTMLVideoElement>(`${selector} video`)];
    const audio = [...document.querySelectorAll<HTMLAudioElement>(`${selector} audio`)];
    return peers.length > 0 && peers.every((peer) => peer.connectionState === "connected")
      && videos.length === videoCount && videos.every((video) => video.videoWidth > 0 && video.readyState >= 2)
      && audio.some((element) => !element.paused && (element.srcObject as MediaStream)?.getAudioTracks().some((track) => !track.muted));
  }, { selector, videoCount });
}

export async function verifyCallDeviceChanges(maya: Page, leo: Page, artifacts: string) {
  const peerCounts = await Promise.all([maya, leo].map((page) => page.evaluate(() => openCallPeers.length)));
  await setDevices(maya, "available", "missing");
  await setDevices(leo, "blocked", "blocked");
  for (const page of [maya, leo]) {
    await page.locator(".control-dock").getByRole("button", { name: "Unmute", exact: true }).click();
    await page.locator(".control-dock").getByRole("button", { name: "Turn camera on", exact: true }).click();
    await page.locator(".proximity-call").getByRole("alert").waitFor();
    await page.locator(".control-dock").getByRole("button", { name: "Turn camera on", exact: true }).waitFor();
  }
  await leo.locator(".control-dock").getByRole("button", { name: "Unmute", exact: true }).waitFor();
  await mediaReceived(leo, ".proximity-call", 0);
  assert.equal(await maya.locator(".control-dock").getByRole("button", { name: "Mute", exact: true }).count(), 1);
  await leo.screenshot({ path: resolve(artifacts, "call-without-devices.png") });

  await setDevices(leo, "available", "available");
  await selectDevices(leo, ".proximity-call");
  await leo.locator(".control-dock").getByRole("button", { name: "Unmute", exact: true }).click();
  await leo.locator(".control-dock").getByRole("button", { name: "Turn camera on", exact: true }).click();
  await mediaReceived(maya, ".proximity-call", 1);
  await setDevices(maya, "available", "available");
  await selectDevices(maya, ".proximity-call");
  await maya.locator(".control-dock").getByRole("button", { name: "Turn camera on", exact: true }).click();
  await mediaReceived(leo, ".proximity-call", 2);
  for (const page of [maya, leo]) {
    assert(await page.evaluate(() => openCallCaptureRequests.some((request) => typeof request.audio === "object" && request.audio.deviceId)
      && openCallCaptureRequests.some((request) => typeof request.video === "object" && request.video.deviceId)));
  }
  await maya.setViewportSize({ width: 390, height: 844 });
  await maya.screenshot({ path: resolve(artifacts, "call-device-settings-mobile.png") });
  assert(await maya.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const settings = await maya.locator(".media-device-settings").boundingBox();
  assert(settings && settings.x >= 0 && settings.x + settings.width <= 390 && settings.y + settings.height < 740);
  await maya.setViewportSize({ width: 1440, height: 1000 });
  for (const page of [maya, leo]) await page.getByRole("button", { name: "Call settings" }).click();

  await maya.locator(".control-dock").getByRole("button", { name: "Mute", exact: true }).click();
  await maya.locator(".control-dock").getByRole("button", { name: "Turn camera off", exact: true }).click();
  await mediaReceived(maya, ".proximity-call", 1);
  assert(await maya.evaluate(() => openCallCaptures.every((stream) => stream.getTracks().every((track) => track.readyState === "ended"))));
  await maya.locator(".control-dock").getByRole("button", { name: "Unmute", exact: true }).click();
  await maya.locator(".control-dock").getByRole("button", { name: "Turn camera on", exact: true }).click();
  await mediaReceived(leo, ".proximity-call", 2);
  assert.deepEqual(await Promise.all([maya, leo].map((page) => page.evaluate(() => openCallPeers.length))), peerCounts);
}

export async function verifyMeetingDeviceChanges(maya: Page, leo: Page, artifacts: string) {
  for (const page of [maya, leo]) {
    await setDevices(page, "missing", "missing");
    const captureCount = await page.evaluate(() => openCallCaptureRequests.length);
    await page.getByRole("button", { name: "Meetings", exact: true }).click();
    await page.locator(".meeting-card").filter({ has: page.getByRole("heading", { name: "Product crit", exact: true }) })
      .getByRole("button", { name: /Join|Start/ }).click();
    await page.getByRole("dialog", { name: "Product crit", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => openCallCaptureRequests.length), captureCount);
  }
  for (const page of [maya, leo]) {
    await page.waitForFunction(() => {
      const peers = openCallPeers.filter((peer) => peer.connectionState !== "closed");
      return peers.length === 1 && peers[0]!.connectionState === "connected";
    });
  }
  const peerCounts = await Promise.all([maya, leo].map((page) => page.evaluate(() => openCallPeers.length)));
  const meeting = maya.getByRole("dialog", { name: "Product crit", exact: true });
  await meeting.getByRole("button", { name: "Unmute", exact: true }).click();
  await meeting.getByRole("button", { name: "Turn camera on", exact: true }).click();
  await meeting.getByText("Microphone not found. Choose another device.", { exact: true }).waitFor();
  await meeting.getByText("Camera not found. Choose another device.", { exact: true }).waitFor();
  await setDevices(maya, "available", "available");
  await selectDevices(maya, ".meeting-overlay");
  await meeting.getByRole("button", { name: "Unmute", exact: true }).click();
  await meeting.getByRole("button", { name: "Turn camera on", exact: true }).click();
  await mediaReceived(leo, ".meeting-overlay", 1);
  await maya.screenshot({ path: resolve(artifacts, "meeting-devices-after-joining.png") });
  assert.deepEqual(await Promise.all([maya, leo].map((page) => page.evaluate(() => openCallPeers.length))), peerCounts);
  for (const page of [maya, leo]) {
    await page.getByRole("button", { name: "Leave meeting", exact: true }).click();
    await page.getByRole("dialog", { name: "Product crit", exact: true }).waitFor({ state: "hidden" });
  }
}
