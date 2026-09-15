import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { ChatMessage } from "@workhard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeetingChat } from "./MeetingChat";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const message: ChatMessage = { id: "message", conversationId: "meeting-chat", userId: "maya", body: "First", sequence: 1, createdAt: "2026-09-15T09:00:00Z" };
const props = { members: [], currentUserId: "maya", disabled: false };

describe("meeting chat", () => {
  it("follows a newer message when a refreshed history has the same length", () => {
    const view = render(<MeetingChat {...props} messages={[message]} onSend={vi.fn()} />);
    const list = view.getByRole("log");
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 900 });
    view.rerender(<MeetingChat {...props} messages={[{ ...message, id: "newest", sequence: 2 }]} onSend={vi.fn()} />);
    expect(list.scrollTop).toBe(900);
  });

  it("keeps older messages in view until jumping or sending, then follows incoming messages", () => {
    const onSend = vi.fn().mockReturnValue(true);
    const view = render(<MeetingChat {...props} messages={[message]} onSend={onSend} />);
    const list = view.getByRole("log");
    Object.defineProperties(list, { scrollHeight: { configurable: true, value: 1200 }, clientHeight: { configurable: true, value: 240 } });
    list.scrollTop = 100;
    fireEvent.scroll(list);
    const second = { ...message, id: "second", sequence: 2, body: "Second" };
    view.rerender(<MeetingChat {...props} messages={[second, message]} onSend={onSend} />);
    expect(list.scrollTop).toBe(100);
    fireEvent.click(view.getByRole("button", { name: "Jump to latest" }));
    expect(list.scrollTop).toBe(1200);
    list.scrollTop = 100;
    fireEvent.scroll(list);
    fireEvent.change(view.getByRole("textbox"), { target: { value: "Reply" } });
    fireEvent.click(view.getByRole("button", { name: "Send meeting message" }));
    expect(onSend).toHaveBeenCalledWith("Reply");
    expect(list.scrollTop).toBe(1200);
    expect(view.queryByRole("button", { name: "Jump to latest" })).toBeNull();
    Object.defineProperty(list, "scrollHeight", { value: 1400 });
    view.rerender(<MeetingChat {...props} messages={[message, second, { ...message, id: "third", sequence: 3 }]} onSend={onSend} />);
    expect(list.scrollTop).toBe(1400);
  });

  it("keeps an unsent draft and refuses submission while leaving", () => {
    const onSend = vi.fn().mockReturnValue(false);
    const view = render(<MeetingChat {...props} messages={[]} onSend={onSend} />);
    const input = view.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Keep this" } });
    fireEvent.click(view.getByRole("button", { name: "Send meeting message" }));
    expect(input.value).toBe("Keep this");
    view.rerender(<MeetingChat {...props} disabled messages={[]} onSend={onSend} />);
    fireEvent.submit(input.closest("form")!);
    expect(onSend).toHaveBeenCalledOnce();
  });

  it("scrolls to the latest after expanding without losing a draft", () => {
    let resize!: ResizeObserverCallback;
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", vi.fn(function (callback: ResizeObserverCallback) {
      resize = callback;
      return { observe: vi.fn(), disconnect };
    }));
    const view = render(<MeetingChat {...props} messages={[message]} onSend={vi.fn()} />);
    const input = view.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Draft" } });
    const list = view.getByRole("log");
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 1200 });
    act(() => resize([], {} as ResizeObserver));
    expect(list.scrollTop).toBe(1200);
    expect(input.value).toBe("Draft");
    list.scrollTop = 0;
    fireEvent.scroll(list);
    act(() => resize([], {} as ResizeObserver));
    expect(list.scrollTop).toBe(0);
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
