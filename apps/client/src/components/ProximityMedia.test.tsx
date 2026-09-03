import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProximityMedia } from "./ProximityMedia";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ProximityMedia", () => {
  it("does not report readiness before device capture succeeds", async () => {
    let resolveMedia: ((stream: MediaStream) => void) | undefined;
    const media = new Promise<MediaStream>((resolve) => {
      resolveMedia = resolve;
    });
    const onMediaChange = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockReturnValue(media) },
    });

    render(<ProximityMedia active microphone camera={false} onUnavailable={vi.fn()} onMediaChange={onMediaChange} />);
    expect(onMediaChange).not.toHaveBeenCalledWith(true, false);

    resolveMedia?.({ getTracks: () => [] } as unknown as MediaStream);
    await waitFor(() => expect(onMediaChange).toHaveBeenCalledWith(true, false));
  });

  it("captures only explicitly enabled devices and stops them when inactive", async () => {
    const stop = vi.fn();
    const onMediaChange = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    const view = render(
      <ProximityMedia active microphone={false} camera={false} onUnavailable={vi.fn()} onMediaChange={onMediaChange} />,
    );

    expect(getUserMedia).not.toHaveBeenCalled();
    view.rerender(<ProximityMedia active microphone camera={false} onUnavailable={vi.fn()} onMediaChange={onMediaChange} />);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false }));
    await waitFor(() => expect(onMediaChange).toHaveBeenLastCalledWith(true, false));
    view.rerender(<ProximityMedia active={false} microphone camera={false} onUnavailable={vi.fn()} onMediaChange={onMediaChange} />);
    expect(stop).toHaveBeenCalledOnce();
    expect(onMediaChange).toHaveBeenLastCalledWith(false, false);
  });

  it("reports a denied device request", async () => {
    const onUnavailable = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error("denied")) },
    });

    const onMediaChange = vi.fn();
    render(<ProximityMedia active microphone camera onUnavailable={onUnavailable} onMediaChange={onMediaChange} />);

    await waitFor(() => expect(onUnavailable).toHaveBeenCalledOnce());
    expect(onMediaChange).toHaveBeenLastCalledWith(false, false);
  });
});
