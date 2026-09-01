import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("sends dropped images and rejects oversized files", async () => {
    const onSendImage = vi.fn().mockResolvedValue(undefined);
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
  });
});
