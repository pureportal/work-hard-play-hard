import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CHARACTER_APPEARANCE, type ProximityMediaSession } from "@workhard/shared";
import { MediaConnection } from "../media-connection";
import { ProximityCall } from "./ProximityCall";

const connections: MediaConnection<ProximityMediaSession>[] = [];
afterEach(() => { cleanup(); connections.splice(0).forEach((connection) => connection.close()); vi.unstubAllGlobals(); });

function fixture() {
  const send = vi.fn().mockReturnValue(true);
  const connection = new MediaConnection<ProximityMediaSession>({ sessionId: "local", callId: null, participants: [], iceServers: [] }, send);
  connections.push(connection);
  const props = { connection, members: [{ id: "maya", name: "Maya Chen", initials: "MC", character: { ...DEFAULT_CHARACTER_APPEARANCE }, email: "maya@example.com",
    title: "Designer", role: "member" as const, permissions: [], color: "#ff7a66", availability: "available" as const, online: true }],
    muted: true, cameraOn: false, onMutedChange: vi.fn(), onCameraChange: vi.fn(), onLeave: vi.fn() };
  return { send, connection, props };
}

function stream(kind: "audio" | "video") {
  const track = { kind, stop: vi.fn(), onended: null };
  return { getTracks: () => [track], getAudioTracks: () => kind === "audio" ? [track] : [], getVideoTracks: () => kind === "video" ? [track] : [] } as unknown as MediaStream;
}

describe("open call", () => {
  it("opens without capture support and keeps device settings and leave available", () => {
    const { send, props } = fixture();
    vi.stubGlobal("navigator", {});
    render(<ProximityCall {...props} />);
    expect(screen.getByRole("region", { name: "Open call" })).toBeTruthy();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: "proximity.set_media", microphone: false, camera: false }));
    fireEvent.click(screen.getByRole("button", { name: "Call settings" }));
    expect(screen.getByRole("combobox", { name: "Microphone" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Camera" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Leave conversation" }));
    expect(props.onLeave).toHaveBeenCalledOnce();
  });

  it("keeps microphone audio when no camera is available", async () => {
    const { send, props } = fixture();
    const microphone = stream("audio");
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn((constraints: MediaStreamConstraints) => constraints.audio
      ? Promise.resolve(microphone) : Promise.reject(new DOMException("Missing camera", "NotFoundError"))) } });
    render(<ProximityCall {...props} muted={false} cameraOn />);
    await waitFor(() => expect(props.onCameraChange).toHaveBeenCalledWith(false));
    expect(props.onMutedChange).not.toHaveBeenCalled();
    expect(props.onLeave).not.toHaveBeenCalled();
    expect(microphone.getTracks()[0]!.stop).not.toHaveBeenCalled();
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ type: "proximity.set_media", microphone: true, camera: false }));
  });

  it("waits for capture, keeps the microphone when enabling camera, and stops both devices on leaving", async () => {
    const { send, props } = fixture();
    const microphone = stream("audio");
    const camera = stream("video");
    let finishCapture: (stream: MediaStream) => void = () => {};
    const getUserMedia = vi.fn().mockImplementationOnce(() => new Promise<MediaStream>((resolve) => { finishCapture = resolve; })).mockResolvedValue(camera);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const view = render(<ProximityCall {...props} muted={false} />);
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ microphone: true }));
    await act(async () => finishCapture(microphone));
    await waitFor(() => expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ type: "proximity.set_media", microphone: true, camera: false })));
    view.rerender(<ProximityCall {...props} muted={false} cameraOn />);
    await waitFor(() => expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ microphone: true, camera: true })));
    expect(microphone.getTracks()[0]!.stop).not.toHaveBeenCalled();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(microphone.getTracks()[0]!.stop).toHaveBeenCalledOnce();
    expect(camera.getTracks()[0]!.stop).toHaveBeenCalledOnce();
  });

  it("stops a delayed capture after leaving and never reports it as ready", async () => {
    const { send, props } = fixture();
    const microphone = stream("audio");
    let finishCapture: (stream: MediaStream) => void = () => {};
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn(() => new Promise<MediaStream>((resolve) => { finishCapture = resolve; })) } });
    const view = render(<ProximityCall {...props} muted={false} />);
    view.unmount();
    await act(async () => finishCapture(microphone));
    expect(microphone.getTracks()[0]!.stop).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ microphone: true }));
  });

  it("shows participants and lets the user leave without locking the conversation", () => {
    const { connection, props } = fixture();
    connection.handle({ type: "proximity.media_state", session: { sessionId: "local", callId: "call", iceServers: [],
      participants: [{ sessionId: "local", userId: "maya", microphone: false, camera: false, screen: false }] } });
    render(<ProximityCall {...props} />);
    expect(screen.getByRole("region", { name: "Open call" })).toBeTruthy();
    expect(screen.getByText("You")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Leave conversation" }));
    expect(props.onLeave).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /lock/i })).toBeNull();
  });

  it("reports denied access and disables only the affected device", async () => {
    const { props } = fixture();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError")) } });
    render(<ProximityCall {...props} muted={false} />);
    await waitFor(() => expect(props.onMutedChange).toHaveBeenCalledWith(true));
    expect(props.onCameraChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("Microphone blocked. Allow access in your browser and try again.");
  });
});
