import { Camera, CameraOff, Expand, Lock, Maximize2, MessageCircle, Mic, MicOff, Minimize2, MonitorUp, PhoneOff, Settings, Shrink, Square, Unlock, Users, Video } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { ChatMessage, Meeting, Member, ReactionKind, WorldObject } from "@workhard/shared";
import { useMediaDevices } from "../hooks/useMediaDevices";
import { useModalFocus } from "../hooks/useModalFocus";
import type { MediaConnection } from "../media-connection";
import { REACTION_ICON, REACTION_LABEL, type DisplayReaction } from "../reactions";
import { Avatar } from "./Avatar";
import { CallVideoStage, type CallVideoTile } from "./CallVideoStage";
import { MeetingAudio, MeetingVideo } from "./MeetingMediaElement";
import { MediaDeviceSettings } from "./MediaDeviceSettings";
import { MeetingChat } from "./MeetingChat";
import { ReactionPicker } from "./ReactionPicker";
import { useCallFullscreen } from "../hooks/useCallFullscreen";

interface MeetingOverlayProps {
  small: boolean;
  meeting: Meeting;
  connection: MediaConnection;
  members: Member[];
  currentUserId: string;
  messages: ChatMessage[];
  muted: boolean;
  cameraOn: boolean;
  leaving: boolean;
  reactions: DisplayReaction[];
  assets: WorldObject[];
  onOpenAsset: (object: WorldObject) => void;
  onInvite: (userId: string) => boolean;
  onLock: (locked: boolean) => void;
  onMutedChange: (muted: boolean) => void;
  onCameraChange: (enabled: boolean) => void;
  onReact: (reaction: ReactionKind) => void;
  onSendMessage: (body: string) => boolean;
  onViewChange: (small: boolean) => void;
  onLeave: () => void;
}

export function MeetingOverlay({ small, meeting, connection, members, currentUserId, messages, muted, cameraOn, leaving, reactions,
  assets, onOpenAsset, onInvite, onLock, onMutedChange, onCameraChange, onReact, onSendMessage, onViewChange, onLeave }: MeetingOverlayProps) {
  const dialogRef = useModalFocus<HTMLElement>(() => {
    if (document.fullscreenElement === dialogRef.current || fullscreen) void document.exitFullscreen();
    else onLeave();
  }, !small);
  const { fullscreen, error: fullscreenError, toggleFullscreen } = useCallFullscreen(dialogRef);
  const [mobileView, setMobileView] = useState<"video" | "chat">("video");
  const [chatOpen, setChatOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [invitee, setInvitee] = useState("");
  const media = useMediaDevices(muted, cameraOn, onMutedChange, onCameraChange);
  const { session, remote } = useSyncExternalStore(connection.subscribe, connection.getSnapshot);
  const canShare = typeof navigator.mediaDevices?.getDisplayMedia === "function";
  const mediaSupported = typeof RTCPeerConnection !== "undefined";
  const failed = [...remote.values()].some((participant) => participant.state === "failed");
  const screens = session.participants.filter((participant) => participant.sessionId === session.sessionId ? Boolean(media.streams.screen) : participant.screen);
  const eligibleInvitees = members.filter((member) => member.online && !session.participants.some((participant) => participant.userId === member.id));
  const tiles: CallVideoTile[] = [
    ...screens.flatMap((participant) => {
      const local = participant.sessionId === session.sessionId;
      const stream = local ? media.streams.screen : remote.get(participant.sessionId)?.screen;
      if (!stream) return [];
      const name = local ? "Your screen" : `${members.find((member) => member.id === participant.userId)?.name ?? "Participant"}’s screen`;
      return [{ id: `screen-${participant.sessionId}`, name, screen: true, content: <MeetingVideo stream={stream} label={name} /> }];
    }),
    ...session.participants.flatMap((participant) => {
      const member = members.find((candidate) => candidate.id === participant.userId);
      if (!member) return [];
      const local = participant.sessionId === session.sessionId;
      const peer = remote.get(participant.sessionId);
      const camera = local ? media.streams.camera : participant.camera ? peer?.camera : undefined;
      const microphone = local ? Boolean(media.streams.microphone) : participant.microphone;
      const reaction = reactions.find((candidate) => candidate.userId === member.id);
      return [{ id: participant.sessionId, name: local ? "You" : member.name, background: `${member.color}22`,
        content: <>{camera ? <MeetingVideo stream={camera} mirror={local} label={`${local ? "Your" : member.name + "’s"} camera`} /> : <Avatar member={member} className="video-avatar" />}
          {!local && peer && <MeetingAudio stream={peer.audio} name={member.name} />}
          {reaction && <span key={reaction.id} className="meeting-reaction" aria-label={`${REACTION_LABEL[reaction.reaction]} reaction`}><img src={REACTION_ICON[reaction.reaction]} alt="" width="31" height="31" /></span>}</>,
        details: <>{!local && peer?.state === "connecting" && <span>Connecting…</span>}{!microphone && <MicOff size={14} aria-label="Microphone off" />}</> }];
    }),
  ];

  useEffect(() => { connection.start(); }, [connection]);
  useEffect(() => { connection.setStreams(media.streams); }, [connection, media.streams]);

  return <div className={small ? "meeting-window-layer" : "modal-backdrop meeting-backdrop"}>
    <section ref={dialogRef} className={`meeting-overlay${small ? " meeting-overlay-small" : ""}`}
      role="dialog" aria-modal={small ? undefined : true} aria-labelledby="meeting-title" aria-busy={leaving} tabIndex={small ? undefined : -1}>
      <header className="meeting-overlay-header">
        <div><h2 id="meeting-title">{meeting.title}</h2></div>
        <div className="meeting-overlay-actions">
          {!small && <div className="meeting-mobile-tabs" role="tablist" aria-label="Meeting view" onKeyDown={(event) => {
            const next = event.key === "Home" ? "video" : event.key === "End" ? "chat"
              : ["ArrowLeft", "ArrowRight"].includes(event.key) ? mobileView === "video" ? "chat" : "video" : undefined;
            if (!next) return;
            event.preventDefault();
            setMobileView(next);
            event.currentTarget.querySelector<HTMLButtonElement>(`#meeting-${next}-tab`)?.focus();
          }}>
            <button id="meeting-video-tab" role="tab" aria-label="Video" aria-selected={mobileView === "video"} aria-controls="meeting-video-panel" tabIndex={mobileView === "video" ? 0 : -1} onClick={() => setMobileView("video")}><Video size={17} /></button>
            <button id="meeting-chat-tab" role="tab" aria-label="Chat" aria-selected={mobileView === "chat"} aria-controls="meeting-chat-panel" tabIndex={mobileView === "chat" ? 0 : -1} onClick={() => setMobileView("chat")}><MessageCircle size={17} /></button>
          </div>}
          <span className="meeting-lock" aria-label={`${session.participants.length} participants${session.locked ? ", locked" : ""}`}>
            {session.locked ? <Lock size={14} /> : <Users size={14} />}{session.participants.length}
          </span>
          {!small && <button type="button" className="meeting-view-button meeting-chat-button" aria-label={chatOpen ? "Hide chat" : "Show chat"}
            aria-expanded={chatOpen} onClick={() => setChatOpen(!chatOpen)}><MessageCircle size={17} /></button>}
          {!small && <button type="button" className="meeting-view-button" aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            onClick={() => void toggleFullscreen()}>{fullscreen ? <Shrink size={17} /> : <Expand size={17} />}</button>}
          <button type="button" className="meeting-view-button" aria-label={small ? "Expand meeting" : "Minimize meeting"}
            disabled={leaving} onClick={() => { setSettingsOpen(false); if (fullscreen) void document.exitFullscreen(); onViewChange(!small); }}>{small ? <Maximize2 size={17} /> : <Minimize2 size={17} />}</button>
        </div>
      </header>

      <div className={`meeting-main show-${mobileView}${chatOpen ? "" : " without-chat"}`}>
        <div className="meeting-stage" id="meeting-video-panel" data-solo={session.participants.length === 1 && screens.length === 0}>
          {(media.errors.length > 0 || failed || !mediaSupported || fullscreenError) && <div className="meeting-media-errors" role="alert">
            {media.errors.map((error) => <p key={error}>{error}</p>)}
            {fullscreenError && <p>{fullscreenError}</p>}
            {!mediaSupported && <p>Audio and video need a browser with WebRTC support.</p>}
            {failed && <p>Media connection interrupted. <button onClick={() => connection.retry()}>Retry media</button></p>}
          </div>}
          {settingsOpen && <div className="meeting-settings" aria-label="Meeting settings">
            <MediaDeviceSettings media={media} disabled={leaving} />
            <form onSubmit={(event) => { event.preventDefault(); if (invitee && onInvite(invitee)) setInvitee(""); }}>
              <label>Invite<select value={invitee} onChange={(event) => setInvitee(event.target.value)}>
                <option value="">Choose a person</option>{eligibleInvitees.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select></label>
              <button className="secondary-button" disabled={!invitee || leaving}>Send invite</button>
            </form>
            {session.hostUserId === currentUserId && <button className="secondary-button" disabled={leaving} onClick={() => onLock(!session.locked)}>
              {session.locked ? <Unlock size={16} /> : <Lock size={16} />}{session.locked ? "Unlock meeting" : "Lock meeting"}
            </button>}
            {assets.length > 0 && <div className="meeting-asset-actions">{assets.map((object) => <button className="secondary-button" key={object.id}
              onClick={() => { setSettingsOpen(false); onOpenAsset(object); }}>{object.label ?? "Open board"}</button>)}</div>}
          </div>}
          <CallVideoStage tiles={tiles} expanded={!small} />
          {!small && session.participants.length === 1 && screens.length === 0 && eligibleInvitees.length > 0 && <button type="button" className="meeting-invite-prompt" onClick={() => setSettingsOpen(true)}><Users size={18} />Invite someone</button>}
        </div>
        <div className="meeting-chat-container" id="meeting-chat-panel" hidden={small}><MeetingChat messages={messages} members={members} currentUserId={currentUserId} disabled={leaving} onSend={onSendMessage} /></div>
      </div>

      <footer className="meeting-controls">
        <button disabled={leaving || !mediaSupported} className={muted ? "is-off" : ""} aria-label={muted ? "Unmute" : "Mute"} onClick={() => onMutedChange(!muted)}>{muted ? <MicOff size={20} /> : <Mic size={20} />}</button>
        <button disabled={leaving || !mediaSupported} className={cameraOn ? "" : "is-off"} aria-label={cameraOn ? "Turn camera off" : "Turn camera on"} onClick={() => onCameraChange(!cameraOn)}>{cameraOn ? <Camera size={20} /> : <CameraOff size={20} />}</button>
        {canShare && <button disabled={leaving || media.sharingPending || !mediaSupported} aria-label={media.streams.screen ? "Stop sharing" : "Share screen or window"} className={media.streams.screen ? "is-sharing" : ""}
          onClick={() => media.streams.screen ? media.stopSharing() : void media.startSharing()}>{media.streams.screen ? <Square size={20} /> : <MonitorUp size={20} />}</button>}
        <button disabled={leaving} aria-label="Meeting settings" aria-expanded={settingsOpen} onClick={() => {
          setSettingsOpen(!settingsOpen); setMobileView("video"); if (small && !settingsOpen) onViewChange(false);
        }}><Settings size={20} /></button>
        <ReactionPicker onReact={onReact} disabled={leaving} />
        <button disabled={leaving} className="leave-call" aria-label={leaving ? "Leaving meeting" : "Leave meeting"} onClick={onLeave}><PhoneOff size={20} /></button>
      </footer>
    </section>
  </div>;
}
