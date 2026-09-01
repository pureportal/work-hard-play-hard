import { Hash, ImagePlus, LoaderCircle, MessageCircle, Send, UserRound, Video, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import type { ChatMessage, Conversation, Member } from "@workhard/shared";
import { resolveServerUrl } from "../server-url";
import { IconButton } from "./IconButton";

interface ChatPanelProps {
  conversations: Conversation[];
  messages: ChatMessage[];
  members: Member[];
  currentUserId: string;
  selectedConversationId?: string | undefined;
  onConversationChange: (conversationId: string) => void;
  onSend: (conversationId: string, body: string) => boolean;
  onSendImage: (conversationId: string, file: File) => Promise<void>;
  onClose: () => void;
}

const conversationIcons = {
  team: Hash,
  area: Hash,
  direct: UserRound,
  meeting: Video,
};

export function ChatPanel({
  conversations,
  messages,
  members,
  currentUserId,
  selectedConversationId,
  onConversationChange,
  onSend,
  onSendImage,
  onClose,
}: ChatPanelProps) {
  const [body, setBody] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const conversationTabsRef = useRef<HTMLDivElement>(null);
  const activeConversationTabRef = useRef<HTMLButtonElement>(null);
  const previousConversationIdRef = useRef<string | undefined>(undefined);
  const stickToBottomRef = useRef(true);
  const dragDepth = useRef(0);
  const selected = conversations.find((conversation) => conversation.id === selectedConversationId) ?? conversations[0];
  const selectedName = selected ? getConversationName(selected, members, currentUserId) : "";
  const visibleMessages = useMemo(
    () => messages.filter((message) => message.conversationId === selected?.id).sort((left, right) => left.sequence - right.sequence),
    [messages, selected?.id],
  );

  useEffect(() => {
    const list = messageListRef.current;
    if (!list || !selected) {
      return;
    }
    const conversationChanged = previousConversationIdRef.current !== selected.id;
    if (conversationChanged || stickToBottomRef.current) {
      list.scrollTop = list.scrollHeight;
    }
    previousConversationIdRef.current = selected.id;
    if (conversationChanged) {
      stickToBottomRef.current = true;
      setImageError(undefined);
    }
  }, [selected?.id, visibleMessages.length]);

  useEffect(() => {
    const tabs = conversationTabsRef.current;
    const activeTab = activeConversationTabRef.current;
    if (!tabs || !activeTab) {
      return;
    }
    const tabsRect = tabs.getBoundingClientRect();
    const activeRect = activeTab.getBoundingClientRect();
    if (activeRect.left < tabsRect.left) {
      tabs.scrollLeft += activeRect.left - tabsRect.left - 6;
    } else if (activeRect.right > tabsRect.right) {
      tabs.scrollLeft += activeRect.right - tabsRect.right + 6;
    }
  }, [selected?.id]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = body.trim();
    if (!value || !selected) {
      return;
    }
    if (!onSend(selected.id, value)) {
      return;
    }
    setBody("");
    inputRef.current?.focus();
  };

  const sendImages = async (source: FileList | File[]) => {
    const files = Array.from(source);
    if (!selected || files.length === 0 || uploading) {
      return;
    }
    if (files.length > 4) {
      setImageError("Send up to four images at once.");
      return;
    }
    const invalidType = files.some((file) => !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type));
    if (invalidType) {
      setImageError("Choose PNG, JPEG, GIF, or WebP images.");
      return;
    }
    if (files.some((file) => file.size > 5 * 1024 * 1024)) {
      setImageError("Each image must be 5 MB or smaller.");
      return;
    }
    setImageError(undefined);
    setUploading(true);
    try {
      for (const file of files) {
        await onSendImage(selected.id, file);
      }
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Image could not be sent.");
    } finally {
      setUploading(false);
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
    }
  };

  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) {
      setDragging(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    void sendImages(event.dataTransfer.files);
  };

  if (!selected) {
    return null;
  }

  return (
    <aside
      className={`side-panel chat-panel ${dragging ? "dragging-image" : ""}`}
      aria-label="Messages"
      onDragEnter={handleDragEnter}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="panel-header">
        <div>
          <h2>Messages</h2>
          <span>{selectedName}</span>
        </div>
        <IconButton label="Close messages" icon={X} onClick={onClose} />
      </div>

      <div ref={conversationTabsRef} className="conversation-tabs" role="tablist" aria-label="Conversations">
        {conversations.map((conversation) => {
          const Icon = conversationIcons[conversation.type];
          return (
            <button
              key={conversation.id}
              ref={conversation.id === selected.id ? activeConversationTabRef : undefined}
              role="tab"
              aria-selected={conversation.id === selected.id}
              className={conversation.id === selected.id ? "active" : ""}
              onClick={() => onConversationChange(conversation.id)}
            >
              <Icon size={15} />
              <span>{getConversationName(conversation, members, currentUserId)}</span>
              {conversation.unread > 0 && <b>{conversation.unread}</b>}
            </button>
          );
        })}
      </div>

      <div
        ref={messageListRef}
        className="message-list panel-scroll"
        aria-live="polite"
        onScroll={(event) => {
          const list = event.currentTarget;
          stickToBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight <= 48;
        }}
      >
        {visibleMessages.length === 0 && (
          <div className="empty-symbol" aria-label="No messages">
            <MessageCircle size={24} />
          </div>
        )}
        {visibleMessages.map((message, index) => {
          const member = members.find((item) => item.id === message.userId);
          const previous = visibleMessages[index - 1];
          const grouped = previous?.userId === message.userId;
          const mine = message.userId === currentUserId;
          const hasImage = Boolean(message.attachments?.length);
          return (
            <div className={`chat-message ${mine ? "mine" : ""} ${grouped ? "grouped" : ""} ${hasImage ? "has-image" : ""}`} key={message.id}>
              {!grouped && !mine && (
                <span className="message-avatar" style={{ background: member?.color }}>
                  {member?.initials ?? "?"}
                </span>
              )}
              <div>
                {!grouped && (
                  <span className="message-meta">
                    <strong>{mine ? "You" : member?.name ?? "Unknown"}</strong>
                    <time>{new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(message.createdAt))}</time>
                  </span>
                )}
                {message.attachments?.map((attachment) => (
                  <a className="chat-image" href={resolveServerUrl(attachment.url)} target="_blank" rel="noreferrer" aria-label={`Open ${attachment.name}`} key={attachment.id}>
                    <img src={resolveServerUrl(attachment.url)} alt={attachment.name} loading="lazy" crossOrigin="use-credentials" />
                  </a>
                ))}
                {message.body && <p>{message.body}</p>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="message-composer-shell">
        <form className="message-composer" onSubmit={submit}>
          <input
            ref={inputRef}
            value={body}
            maxLength={500}
            aria-label={`Message ${selectedName}`}
            placeholder={`Message ${selected.type === "team" || selected.type === "area" ? "#" : ""}${selectedName}`}
            onChange={(event) => setBody(event.target.value)}
          />
          <input
            ref={imageInputRef}
            className="sr-only"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            aria-label="Add images"
            onChange={(event) => event.target.files && void sendImages(event.target.files)}
          />
          <button type="button" className="composer-attachment" aria-label="Add images" disabled={uploading} onClick={() => imageInputRef.current?.click()}>
            {uploading ? <LoaderCircle className="spin" size={17} /> : <ImagePlus size={17} />}
          </button>
          <button aria-label="Send message" disabled={!body.trim()}>
            <Send size={17} />
          </button>
        </form>
        {imageError && <p className="composer-error" role="alert">{imageError}</p>}
      </div>
      {dragging && <div className="image-drop-target">Drop images</div>}
    </aside>
  );
}

function getConversationName(conversation: Conversation, members: Member[], currentUserId: string): string {
  if (conversation.type !== "direct") {
    return conversation.name;
  }
  const peerId = conversation.participantIds?.find((userId) => userId !== currentUserId);
  return members.find((member) => member.id === peerId)?.name ?? conversation.name;
}
