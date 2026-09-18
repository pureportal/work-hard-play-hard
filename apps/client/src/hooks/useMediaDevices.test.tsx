import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMediaDevices } from "./useMediaDevices";

const originalDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
afterEach(() => {
  cleanup();
  if (originalDevices) Object.defineProperty(navigator, "mediaDevices", originalDevices);
  else Reflect.deleteProperty(navigator, "mediaDevices");
  vi.restoreAllMocks();
});

function capture(kind: "audio" | "video") {
  const track = { kind, stop: vi.fn(), onended: null as (() => void) | null, contentHint: "" };
  const stream = { getTracks: () => [track], getAudioTracks: () => kind === "audio" ? [track] : [],
    getVideoTracks: () => kind === "video" ? [track] : [] } as unknown as MediaStream;
  return { track, stream };
}

function devices(getUserMedia = vi.fn(), getDisplayMedia = vi.fn()) {
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia, getDisplayMedia } });
}

function pendingCapture() {
  let resolve!: (stream: MediaStream) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<MediaStream>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

describe("meeting capture lifecycle", () => {
  it.each(["resolve", "reject"] as const)("ignores an older device scan that finishes with %s after a newer scan", async (outcome) => {
    let complete!: (devices: MediaDeviceInfo[]) => void;
    let fail!: (reason: Error) => void;
    const pending = new Promise<MediaDeviceInfo[]>((resolve, reject) => { complete = resolve; fail = reject; });
    const currentDevices = [{ deviceId: "usb-microphone", kind: "audioinput", label: "USB microphone" }] as MediaDeviceInfo[];
    const enumerateDevices = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(currentDevices);
    const mediaDevices = Object.assign(new EventTarget(), { enumerateDevices });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: mediaDevices });
    const { result } = renderHook(() => useMediaDevices(true, false, vi.fn(), vi.fn()));
    act(() => { mediaDevices.dispatchEvent(new Event("devicechange")); });
    await waitFor(() => expect(result.current.devices).toEqual(currentDevices));
    await act(async () => {
      if (outcome === "resolve") complete([]);
      else fail(new Error("Old scan failed"));
      await pending.catch(() => undefined);
    });
    expect(result.current.devices).toEqual(currentDevices);
  });

  it("keeps microphone capture when the camera disconnects", async () => {
    const microphone = capture("audio");
    const camera = capture("video");
    devices(vi.fn().mockImplementation((constraints: MediaStreamConstraints) => Promise.resolve(constraints.audio ? microphone.stream : camera.stream)));
    const onCameraChange = vi.fn();
    const { result } = renderHook(() => useMediaDevices(false, true, vi.fn(), onCameraChange));
    await waitFor(() => expect(result.current.streams.camera).toBe(camera.stream));
    act(() => camera.track.onended?.());
    expect(result.current.streams.camera).toBeUndefined();
    expect(result.current.errors).toEqual([expect.stringContaining("Camera disconnected")]);
    expect(onCameraChange).toHaveBeenCalledWith(false);
    expect(result.current.streams.microphone).toBe(microphone.stream);
    expect(microphone.track.stop).not.toHaveBeenCalled();
  });

  it("releases screen permission results that arrive after leaving", async () => {
    const pending = pendingCapture();
    const screen = capture("video");
    devices(vi.fn(), vi.fn().mockReturnValue(pending.promise));
    const { result, unmount } = renderHook(() => useMediaDevices(true, false, vi.fn(), vi.fn()));
    let sharing!: Promise<void>;
    act(() => { sharing = result.current.startSharing(); });
    unmount();
    await act(async () => { pending.resolve(screen.stream); await sharing; });
    expect(screen.track.stop).toHaveBeenCalledOnce();
    expect(result.current.streams.screen).toBeUndefined();
  });

  it("captures microphone and camera independently, uses voice processing, and releases devices on mute", async () => {
    const microphone = capture("audio");
    const camera = capture("video");
    const getUserMedia = vi.fn().mockImplementation((constraints: MediaStreamConstraints) =>
      constraints.audio ? Promise.resolve(microphone.stream) : Promise.resolve(camera.stream));
    devices(getUserMedia);
    const { result, rerender, unmount } = renderHook(({ muted, cameraOn }) => useMediaDevices(muted, cameraOn, vi.fn(), vi.fn()),
      { initialProps: { muted: true, cameraOn: false } });
    expect(getUserMedia).not.toHaveBeenCalled();
    rerender({ muted: false, cameraOn: true });
    await waitFor(() => expect(result.current.streams.camera).toBe(camera.stream));
    expect(result.current.streams.microphone).toBe(microphone.stream);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }, video: false });
    expect(microphone.track.contentHint).toBe("speech");
    rerender({ muted: true, cameraOn: true });
    expect(microphone.track.stop).toHaveBeenCalledOnce();
    expect(camera.track.stop).not.toHaveBeenCalled();
    unmount();
    expect(camera.track.stop).toHaveBeenCalledOnce();
  });

  it("does not attach a late permission result after muting or unmounting", async () => {
    const microphone = capture("audio");
    const pending = pendingCapture();
    devices(vi.fn().mockReturnValue(pending.promise));
    const onMutedChange = vi.fn();
    const { result, rerender, unmount } = renderHook(({ muted }) => useMediaDevices(muted, false, onMutedChange, vi.fn()),
      { initialProps: { muted: false } });
    rerender({ muted: true });
    unmount();
    await act(async () => { pending.resolve(microphone.stream); });
    expect(microphone.track.stop).toHaveBeenCalledOnce();
    expect(result.current.streams.microphone).toBeUndefined();
    expect(onMutedChange).not.toHaveBeenCalled();
  });

  it("keeps a working camera when microphone permission is denied and allows retry", async () => {
    const camera = capture("video");
    const microphone = capture("audio");
    const getUserMedia = vi.fn().mockImplementation((constraints: MediaStreamConstraints) => constraints.audio
      ? Promise.reject(new DOMException("Denied", "NotAllowedError")) : Promise.resolve(camera.stream));
    devices(getUserMedia);
    const onMutedChange = vi.fn();
    const onCameraChange = vi.fn();
    const { result, rerender } = renderHook(({ muted }) => useMediaDevices(muted, true, onMutedChange, onCameraChange),
      { initialProps: { muted: false } });
    await waitFor(() => expect(result.current.errors).toEqual([expect.stringContaining("Microphone blocked")]));
    expect(onMutedChange).toHaveBeenCalledWith(true);
    expect(result.current.streams.camera).toBe(camera.stream);
    expect(onCameraChange).not.toHaveBeenCalled();
    rerender({ muted: true });
    getUserMedia.mockResolvedValue(microphone.stream);
    rerender({ muted: false });
    await waitFor(() => expect(result.current.streams.microphone).toBe(microphone.stream));
    expect(result.current.errors).toEqual([]);
    expect(camera.track.stop).not.toHaveBeenCalled();
  });

  it("ignores stale device errors after switching microphone and changes noise filtering without restarting the camera", async () => {
    const oldMicrophone = pendingCapture();
    const nextMicrophone = capture("audio");
    const camera = capture("video");
    const getUserMedia = vi.fn().mockImplementation((constraints: MediaStreamConstraints) => constraints.audio
      ? oldMicrophone.promise : Promise.resolve(camera.stream));
    devices(getUserMedia);
    const onMutedChange = vi.fn();
    const { result } = renderHook(() => useMediaDevices(false, true, onMutedChange, vi.fn()));
    await waitFor(() => expect(result.current.streams.camera).toBe(camera.stream));
    getUserMedia.mockResolvedValue(nextMicrophone.stream);
    act(() => result.current.setMicrophoneId("usb-mic"));
    await waitFor(() => expect(result.current.streams.microphone).toBe(nextMicrophone.stream));
    await act(async () => { oldMicrophone.reject(new DOMException("Denied", "NotAllowedError")); });
    expect(onMutedChange).not.toHaveBeenCalled();
    expect(result.current.errors).toEqual([]);
    act(() => result.current.setNoiseSuppression(false));
    await waitFor(() => expect(getUserMedia).toHaveBeenLastCalledWith({ audio: expect.objectContaining({ deviceId: { exact: "usb-mic" }, noiseSuppression: false }), video: false }));
    expect(camera.track.stop).not.toHaveBeenCalled();
  });

  it("stops screen and shared audio when the browser ends sharing", async () => {
    const screen = capture("video");
    const audio = capture("audio");
    screen.stream.getTracks = () => [screen.track, audio.track] as unknown as MediaStreamTrack[];
    devices(vi.fn(), vi.fn().mockResolvedValue(screen.stream));
    const { result } = renderHook(() => useMediaDevices(true, false, vi.fn(), vi.fn()));
    await act(() => result.current.startSharing());
    expect(result.current.streams.screen).toBe(screen.stream);
    expect(screen.track.contentHint).toBe("detail");
    act(() => screen.track.onended?.());
    expect(result.current.streams.screen).toBeUndefined();
    expect(screen.track.stop).toHaveBeenCalledOnce();
    expect(audio.track.stop).toHaveBeenCalledOnce();
  });

  it("releases a cancelled pending screen capture and lets the user share again", async () => {
    const pending = pendingCapture();
    const oldScreen = capture("video");
    const nextScreen = capture("video");
    const getDisplayMedia = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(nextScreen.stream);
    devices(vi.fn(), getDisplayMedia);
    const { result, unmount } = renderHook(() => useMediaDevices(true, false, vi.fn(), vi.fn()));
    let sharing: Promise<void>;
    act(() => { sharing = result.current.startSharing(); });
    expect(result.current.sharingPending).toBe(true);
    act(() => result.current.stopSharing());
    await act(async () => { pending.resolve(oldScreen.stream); await sharing; });
    expect(oldScreen.track.stop).toHaveBeenCalledOnce();
    expect(result.current.sharingPending).toBe(false);
    expect(result.current.streams.screen).toBeUndefined();
    await act(() => result.current.startSharing());
    expect(result.current.streams.screen).toBe(nextScreen.stream);
    unmount();
    expect(nextScreen.track.stop).toHaveBeenCalledOnce();
  });
});
