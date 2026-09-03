import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, Conversation, Member } from "@workhard/shared";
import { ChatPanel } from "./ChatPanel";

const member: Member = {
  id: "user-maya",
  name: "Maya Chen",
  initials: "MC",
  email: "maya@example.com",
  title: "Product Lead",
  role: "owner",
  permissions: ["manage_members", "build"],
  color: "#ff7a66",
  availability: "available",
  online: true,
};

const conversation: Conversation = {
  id: "conversation-team",
  name: "Northstar",
  type: "team",
  unread: 0,
};

const message: ChatMessage = {
  id: "message-1",
  conversationId: conversation.id,
  userId: member.id,
  body: "Ready for review.",
  createdAt: "2026-08-29T09:00:00.000Z",
  sequence: 1,
};

afterEach(cleanup);

describe("ChatPanel", () => {
  it("renders seeded history and submits a new message", () => {
    const onSend = vi.fn(() => true);
    render(
      <ChatPanel
        conversations={[conversation]}
        messages={[message]}
        members={[member]}
        currentUserId={member.id}
        selectedConversationId={conversation.id}
        onConversationChange={vi.fn()}
        onSend={onSend}
        onSendImage={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Ready for review.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Message Northstar"), { target: { value: "On my way." } });
    fireEvent.click(screen.getByLabelText("Send message"));

    expect(onSend).toHaveBeenCalledWith(conversation.id, "On my way.");
    expect((screen.getByLabelText("Message Northstar") as HTMLInputElement).value).toBe("");
  });

  it("preserves a draft when the connection cannot send it", () => {
    render(
      <ChatPanel
        conversations={[conversation]}
        messages={[]}
        members={[member]}
        currentUserId={member.id}
        selectedConversationId={conversation.id}
        onConversationChange={vi.fn()}
        onSend={() => false}
        onSendImage={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Message Northstar") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Keep this draft." } });
    fireEvent.click(screen.getByLabelText("Send message"));

    expect(input.value).toBe("Keep this draft.");
  });

  it("labels a direct conversation with the other participant", () => {
    const peer: Member = {
      ...member,
      id: "user-leo",
      name: "Leo Martins",
      initials: "LM",
      email: "leo@example.com",
      role: "member",
      permissions: [],
    };
    const direct: Conversation = {
      id: "conversation-direct",
      name: "Direct message",
      type: "direct",
      participantIds: [member.id, peer.id],
      unread: 0,
    };

    render(
      <ChatPanel
        conversations={[direct]}
        messages={[]}
        members={[member, peer]}
        currentUserId={member.id}
        selectedConversationId={direct.id}
        onConversationChange={vi.fn()}
        onSend={vi.fn()}
        onSendImage={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Message Leo Martins")).toBeTruthy();
    expect(screen.queryByText("Direct message")).toBeNull();
  });

  it("moves between conversation tabs with the keyboard", () => {
    const roomConversation: Conversation = {
      id: "conversation-room",
      name: "Studio",
      type: "room",
      roomId: "room-studio",
      unread: 1,
    };
    const onConversationChange = vi.fn();
    render(
      <ChatPanel
        conversations={[conversation, roomConversation]}
        messages={[message]}
        members={[member]}
        currentUserId={member.id}
        selectedConversationId={conversation.id}
        onConversationChange={onConversationChange}
        onSend={vi.fn()}
        onSendImage={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const activeTab = screen.getByRole("tab", { name: "Northstar" });
    const nextTab = screen.getByRole("tab", { name: /Studio/ });
    expect(activeTab.getAttribute("tabindex")).toBe("0");
    expect(nextTab.getAttribute("tabindex")).toBe("-1");

    fireEvent.keyDown(activeTab, { key: "ArrowRight" });

    expect(onConversationChange).toHaveBeenCalledWith(roomConversation.id);
    expect(document.activeElement).toBe(nextTab);
  });

  it("offers a quick return when reading older messages", () => {
    const view = render(
      <ChatPanel
        conversations={[conversation]}
        messages={[message]}
        members={[member]}
        currentUserId={member.id}
        selectedConversationId={conversation.id}
        onConversationChange={vi.fn()}
        onSend={vi.fn()}
        onSendImage={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const messageList = view.container.querySelector(".message-list") as HTMLDivElement;
    Object.defineProperties(messageList, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 800 },
    });
    messageList.scrollTop = 100;

    fireEvent.scroll(messageList);
    fireEvent.click(screen.getByRole("button", { name: "Jump to latest" }));

    expect(messageList.scrollTop).toBe(800);
    expect(screen.queryByRole("button", { name: "Jump to latest" })).toBeNull();
  });

  it("sends dropped images and rejects oversized files", async () => {
    let finishUpload: () => void = () => undefined;
    const onSendImage = vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
      finishUpload = resolve;
    }));
    const view = render(
      <ChatPanel
        conversations={[conversation]}
        messages={[]}
        members={[member]}
        currentUserId={member.id}
        selectedConversationId={conversation.id}
        onConversationChange={vi.fn()}
        onSend={vi.fn()}
        onSendImage={onSendImage}
        onClose={vi.fn()}
      />,
    );
    const panel = view.getByLabelText("Messages");
    const image = new File([new Uint8Array([1, 2, 3])], "diagram.png", { type: "image/png" });
    fireEvent.drop(panel, { dataTransfer: { files: [image], types: ["Files"] } });

    await waitFor(() => expect(onSendImage).toHaveBeenCalledWith(conversation.id, image));

    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" });
    fireEvent.drop(panel, { dataTransfer: { files: [oversized], types: ["Files"] } });
    expect((await screen.findByRole("alert")).textContent).toContain("5 MB or smaller");
    await act(async () => finishUpload());
  });
});
