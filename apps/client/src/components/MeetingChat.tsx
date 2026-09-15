import { ArrowDown, MessageCircle, Send } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMessage, Member } from "@workhard/shared";
import { resolveServerUrl } from "../server-url";
import { Avatar } from "./Avatar";
import { LinkedText } from "./LinkedText";

export function MeetingChat({ messages, members, currentUserId, disabled, onSend }: {
  messages: ChatMessage[];
  members: Member[];
  currentUserId: string;
  disabled: boolean;
  onSend: (body: string) => boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [body, setBody] = useState("");
  const [showJump, setShowJump] = useState(false);
  const sortedMessages = [...messages].sort((left, right) => left.sequence - right.sequence);
  const latestMessageId = sortedMessages.at(-1)?.id;
  const jump = () => {
    stickToBottom.current = true;
    setShowJump(false);
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  };
  useEffect(() => { if (stickToBottom.current) jump(); }, [latestMessageId]);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new ResizeObserver(() => { if (stickToBottom.current) jump(); });
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (disabled || !body.trim() || !onSend(body.trim())) return;
    jump();
    setBody("");
  };

  return <aside className="meeting-chat" aria-label="Meeting chat">
    <header><MessageCircle size={17} /><strong>Chat</strong></header>
    <div className="message-list-shell">
      <div ref={listRef} className="meeting-message-list" role="log" aria-label="Meeting messages" onScroll={(event) => {
        const list = event.currentTarget;
        const latest = list.scrollHeight - list.scrollTop - list.clientHeight <= 48;
        stickToBottom.current = latest;
        setShowJump(!latest);
      }}>
        {sortedMessages.map((message) => {
          const member = members.find((item) => item.id === message.userId);
          return <div key={message.id}>
            <Avatar member={member} className="message-avatar" />
            <p><strong>{message.userId === currentUserId ? "You" : member?.name}</strong>
              {message.attachments?.map((attachment) => <a className="meeting-chat-image" href={resolveServerUrl(attachment.url)} target="_blank" rel="noreferrer" aria-label={`Open ${attachment.name}`} key={attachment.id}>
                <img src={resolveServerUrl(attachment.url)} alt={attachment.name} loading="lazy" crossOrigin="use-credentials" onLoad={() => { if (stickToBottom.current) jump(); }} />
              </a>)}
              <LinkedText text={message.body} />
            </p>
          </div>;
        })}
      </div>
      {showJump && <button className="jump-to-latest" onClick={jump}><ArrowDown size={15} />Jump to latest</button>}
    </div>
    <form onSubmit={submit}>
      <input aria-label="Meeting message" value={body} maxLength={500} placeholder="Message" disabled={disabled} onChange={(event) => setBody(event.target.value)} />
      <button aria-label="Send meeting message" disabled={disabled || !body.trim()}><Send size={16} /></button>
    </form>
  </aside>;
}
