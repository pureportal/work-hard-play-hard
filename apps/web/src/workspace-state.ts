import type { BootstrapData } from "@workhard/shared";

export function mergeWorkspaceSnapshot(
  current: BootstrapData,
  snapshot: BootstrapData,
  activeConversationId?: string,
): BootstrapData {
  const knownMessageIds = new Set(current.messages.map((message) => message.id));
  const currentConversationIds = new Set(current.conversations.map((conversation) => conversation.id));
  const missedByConversation = new Map<string, number>();

  for (const message of snapshot.messages) {
    if (
      knownMessageIds.has(message.id)
      || message.userId === current.currentUserId
      || !currentConversationIds.has(message.conversationId)
      || message.conversationId === activeConversationId
    ) {
      continue;
    }
    missedByConversation.set(
      message.conversationId,
      (missedByConversation.get(message.conversationId) ?? 0) + 1,
    );
  }

  const currentUnread = new Map(
    current.conversations.map((conversation) => [conversation.id, conversation.unread]),
  );

  return {
    ...snapshot,
    conversations: snapshot.conversations.map((conversation) => ({
      ...conversation,
      unread: conversation.id === activeConversationId
        ? 0
        : (currentUnread.get(conversation.id) ?? conversation.unread)
          + (missedByConversation.get(conversation.id) ?? 0),
    })),
  };
}
