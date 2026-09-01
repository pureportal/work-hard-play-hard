import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Meeting, Member } from "@workhard/shared";
import { MeetingOverlay } from "./MeetingOverlay";

const member: Member = {
  id: "user-maya",
  name: "Maya Chen",
  initials: "MC",
  email: "maya@example.com",
  title: "Product Lead",
  role: "owner",
  color: "#ff7a66",
  availability: "available",
  online: true,
};

const meeting: Meeting = {
  id: "meeting",
  title: "Review",
  startsAt: "2026-08-30T09:00:00.000Z",
  durationMinutes: 30,
  status: "live",
  participantIds: [member.id],
  location: { type: "public", floorId: "floor", x: 100, y: 100, radius: 60 },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MeetingOverlay media", () => {
  it("does not capture media on entry and stops explicitly enabled tracks on leave", async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    const commonProps = {
      meeting,
      members: [member],
      currentUserId: member.id,
      messages: [],
      cameraOn: false,
      reactions: [],
      onMutedChange: vi.fn(),
      onCameraChange: vi.fn(),
      onReact: vi.fn(),
      onSendMessage: vi.fn(),
      onLeave: vi.fn(),
    };
    const view = render(<MeetingOverlay {...commonProps} muted />);

    expect(getUserMedia).not.toHaveBeenCalled();
    view.rerender(<MeetingOverlay {...commonProps} muted={false} />);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false }));
    view.unmount();
    expect(stop).toHaveBeenCalled();
  });

  it("turns failed media controls back off", async () => {
    const onMutedChange = vi.fn();
    const onCameraChange = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error("denied")) },
    });

    const view = render(
      <MeetingOverlay
        meeting={meeting}
        members={[member]}
        currentUserId={member.id}
        messages={[]}
        muted={false}
        cameraOn
        reactions={[]}
        onMutedChange={onMutedChange}
        onCameraChange={onCameraChange}
        onReact={vi.fn()}
        onSendMessage={vi.fn()}
        onLeave={vi.fn()}
      />,
    );

    await waitFor(() => expect(view.getByText("Check media permission.")).toBeTruthy());
    expect(onMutedChange).toHaveBeenCalledWith(true);
    expect(onCameraChange).toHaveBeenCalledWith(false);
  });

  it("contains keyboard focus and restores it after closing", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const onLeave = vi.fn();
    const view = render(
      <MeetingOverlay
        meeting={meeting}
        members={[member]}
        currentUserId={member.id}
        messages={[]}
        muted
        cameraOn={false}
        reactions={[]}
        onMutedChange={vi.fn()}
        onCameraChange={vi.fn()}
        onReact={vi.fn()}
        onSendMessage={vi.fn()}
        onLeave={onLeave}
      />,
    );
    const dialog = view.getByRole("dialog");
    const first = view.getByRole("tab", { name: "Video" });
    const last = view.getByRole("button", { name: "Leave meeting" });

    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onLeave).toHaveBeenCalledOnce();

    view.unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("dismisses the reaction picker before closing the meeting", () => {
    const onLeave = vi.fn();
    const view = render(
      <MeetingOverlay
        meeting={meeting}
        members={[member]}
        currentUserId={member.id}
        messages={[]}
        muted
        cameraOn={false}
        reactions={[]}
        onMutedChange={vi.fn()}
        onCameraChange={vi.fn()}
        onReact={vi.fn()}
        onSendMessage={vi.fn()}
        onLeave={onLeave}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "React" }));
    expect(view.getByRole("group", { name: "Reactions" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(view.queryByRole("group", { name: "Reactions" })).toBeNull();
    expect(onLeave).not.toHaveBeenCalled();
  });
});
