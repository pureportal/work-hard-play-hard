import { Camera, CameraOff, Maximize2, MessageCircle, Mic, MicOff, Minimize2, PhoneOff, Send, Users, Video } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMessage, Meeting, Member, ReactionKind } from "@workhard/shared";
import { useLocalMedia } from "../hooks/useLocalMedia";
import { useModalFocus } from "../hooks/useModalFocus";
import { REACTION_EMOJI, REACTION_LABEL, type DisplayReaction } from "../reactions";
import { resolveServerUrl } from "../server-url";
import { Avatar } from "./Avatar";
import { ReactionPicker } from "./ReactionPicker";

interface MeetingOverlayProps {
  small: boolean;
  meeting: Meeting;
  members: Member[];
  currentUserId: string;
  messages: ChatMessage[];
  muted: boolean;
  cameraOn: boolean;
  leaving: boolean;
  reactions: DisplayReaction[];
  onMutedChange: (muted: boolean) => void;
  onCameraChange: (enabled: boolean) => void;
  onReact: (reaction: ReactionKind) => void;
  onSendMessage: (body: string) => boolean;
  onViewChange: (small: boolean) => void;
  onLeave: () => void;
}

export function MeetingOverlay({
  small,
  meeting,
  members,
  currentUserId,
  messages,
  muted,
  cameraOn,
  leaving,
  reactions,
  onMutedChange,
  onCameraChange,
  onReact,
  onSendMessage,
  onViewChange,
  onLeave,
}: MeetingOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const dialogRef = useModalFocus<HTMLElement>(onLeave, !small);
  const stickToBottomRef = useRef(true);
  const [body, setBody] = useState("");
  const [mobileView, setMobileView] = useState<"video" | "chat">("video");
  const participants = meeting.participantIds
    .map((userId) => members.find((member) => member.id === userId))
    .filter((member): member is Member => Boolean(member));

  const mediaError = useLocalMedia({
    active: true,
    microphone: !muted,
    camera: cameraOn,
    videoRef,
    onUnavailable: () => {
      if (cameraOn) {
        onCameraChange(false);
      }
      if (!muted) {
        onMutedChange(true);
      }
    },
  });

  useEffect(() => {
    const list = messageListRef.current;
    if (list && stickToBottomRef.current) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages.length]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim()) {
      return;
    }
    if (!onSendMessage(body.trim())) {
      return;
    }
    setBody("");
  };

  const meetingWindow = (
      <section
        ref={dialogRef}
        className={`meeting-overlay${small ? " meeting-overlay-small" : ""}`}
        role="dialog"
        aria-modal={small ? undefined : true}
        aria-labelledby="meeting-title"
        aria-busy={leaving}
        tabIndex={small ? undefined : -1}
      >
        <header className="meeting-overlay-header">
          <div>
            <span className="live-pill"><span />Live</span>
            <h2 id="meeting-title">{meeting.title}</h2>
          </div>
          <div className="meeting-overlay-actions">
            {!small && <div className="meeting-mobile-tabs" role="tablist" aria-label="Meeting view">
              <button role="tab" aria-label="Video" aria-selected={mobileView === "video"} onClick={() => setMobileView("video")}>
                <Video size={17} />
              </button>
              <button role="tab" aria-label="Chat" aria-selected={mobileView === "chat"} onClick={() => setMobileView("chat")}>
                <MessageCircle size={17} />
              </button>
            </div>}
            <span className="meeting-lock"><Users size={14} />{participants.length}</span>
            <button
              type="button"
              className="meeting-view-button"
              aria-label={small ? "Expand meeting" : "Minimize meeting"}
              disabled={leaving}
              onClick={() => onViewChange(!small)}
            >
              {small ? <Maximize2 size={17} /> : <Minimize2 size={17} />}
            </button>
          </div>
        </header>

        <div className={`meeting-main show-${mobileView}`}>
          <div className={`video-grid ${participants.length === 1 ? "single-participant" : ""}`}>
            {participants.map((member) => {
              const isCurrentUser = member.id === currentUserId;
              const reaction = reactions.find((candidate) => candidate.userId === member.id);
              return (
                <article className="video-tile" key={member.id} style={{ background: `${member.color}22` }}>
                  {isCurrentUser && cameraOn && !mediaError ? (
                    <video ref={videoRef} autoPlay muted playsInline />
                  ) : (
                    <Avatar member={member} className="video-avatar" />
                  )}
                  {reaction && (
                    <span className="meeting-reaction" aria-label={`${REACTION_LABEL[reaction.reaction]} reaction`}>
                      {REACTION_EMOJI[reaction.reaction]}
                    </span>
                  )}
                  {isCurrentUser && mediaError && <p>Check media permission.</p>}
                  <footer>
                    <strong>{isCurrentUser ? "You" : member.name}</strong>
                    {isCurrentUser && muted && <MicOff size={14} />}
                  </footer>
                </article>
              );
            })}
          </div>

          {!small && <aside className="meeting-chat" aria-label="Meeting chat">
            <header><MessageCircle size={17} /><strong>Chat</strong></header>
            <div
              ref={messageListRef}
              className="meeting-message-list"
              aria-live="polite"
              onScroll={(event) => {
                const list = event.currentTarget;
                stickToBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight <= 48;
              }}
            >
              {messages.map((message) => {
                const member = members.find((item) => item.id === message.userId);
                return (
                  <div key={message.id}>
                    <Avatar member={member} className="message-avatar" />
                    <p>
                      <strong>{message.userId === currentUserId ? "You" : member?.name}</strong>
                      {message.attachments?.map((attachment) => (
                        <a className="meeting-chat-image" href={resolveServerUrl(attachment.url)} target="_blank" rel="noreferrer" aria-label={`Open ${attachment.name}`} key={attachment.id}>
                          <img src={resolveServerUrl(attachment.url)} alt={attachment.name} loading="lazy" crossOrigin="use-credentials" />
                        </a>
                      ))}
                      {message.body}
                    </p>
                  </div>
                );
              })}
            </div>
            <form onSubmit={submit}>
              <input aria-label="Meeting message" value={body} maxLength={500} placeholder="Message" disabled={leaving} onChange={(event) => setBody(event.target.value)} />
              <button aria-label="Send meeting message" disabled={leaving || !body.trim()}><Send size={16} /></button>
            </form>
          </aside>}
        </div>

        <footer className="meeting-controls">
          <button disabled={leaving} className={muted ? "is-off" : ""} aria-label={muted ? "Unmute" : "Mute"} onClick={() => onMutedChange(!muted)}>
            {muted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <button disabled={leaving} className={cameraOn ? "" : "is-off"} aria-label={cameraOn ? "Turn camera off" : "Turn camera on"} onClick={() => onCameraChange(!cameraOn)}>
            {cameraOn ? <Camera size={20} /> : <CameraOff size={20} />}
          </button>
          <ReactionPicker onReact={onReact} disabled={leaving} />
          <button disabled={leaving} className="leave-call" aria-label={leaving ? "Leaving meeting" : "Leave meeting"} onClick={onLeave}><PhoneOff size={20} /></button>
        </footer>
      </section>
  );
  return (
    <div className={small ? "meeting-window-layer" : "modal-backdrop meeting-backdrop"}>
      {meetingWindow}
    </div>
  );
}
