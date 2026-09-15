import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeetingAudio } from "./MeetingMediaElement";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("meeting audio playback", () => {
  it("offers playback recovery when a track arrives after mounting without an addtrack event", async () => {
    const tracks: MediaStreamTrack[] = [];
    const stream = { getAudioTracks: () => tracks } as unknown as MediaStream;
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new DOMException("Blocked", "NotAllowedError"));
    const view = render(<MeetingAudio stream={stream} name="Maya" />);
    expect(play).not.toHaveBeenCalled();
    tracks.push({ id: "microphone" } as MediaStreamTrack);
    view.rerender(<MeetingAudio stream={stream} name="Maya" />);
    const retry = await view.findByRole("button", { name: "Play Maya’s audio" });
    play.mockResolvedValue(undefined);
    fireEvent.click(retry);
    await waitFor(() => expect(view.queryByRole("button")).toBeNull());
    expect(play).toHaveBeenCalledTimes(2);
    const audio = view.container.querySelector("audio")!;
    view.unmount();
    expect(audio.srcObject).toBeNull();
  });
});
