import { Camera, CameraOff, Expand, Maximize2, Mic, MicOff, Minimize2, PhoneOff, Settings, Shrink } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Member, ProximityMediaSession } from "@workhard/shared";
import { useCallFullscreen } from "../hooks/useCallFullscreen";
import { useMediaDevices } from "../hooks/useMediaDevices";
import { useModalFocus } from "../hooks/useModalFocus";
import type { MediaConnection } from "../media-connection";
import { Avatar } from "./Avatar";
import { CallVideoStage, type CallVideoTile } from "./CallVideoStage";
import { MeetingAudio, MeetingVideo } from "./MeetingMediaElement";
import { MediaDeviceSettings } from "./MediaDeviceSettings";

interface ProximityCallProps {
  connection: MediaConnection<ProximityMediaSession>;
  members: Member[];
  muted: boolean;
  cameraOn: boolean;
  onMutedChange: (muted: boolean) => void;
  onCameraChange: (enabled: boolean) => void;
  onLeave: () => void;
}

export function ProximityCall({ connection, members, muted, cameraOn, onMutedChange, onCameraChange, onLeave }: ProximityCallProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const callRef = useModalFocus<HTMLElement>(() => {
    if (document.fullscreenElement === callRef.current || fullscreen) void document.exitFullscreen();
    else setExpanded(false);
  }, expanded);
  const { fullscreen, error: fullscreenError, toggleFullscreen } = useCallFullscreen(callRef);
  const media = useMediaDevices(muted, cameraOn, onMutedChange, onCameraChange);
  const { session, remote } = useSyncExternalStore(connection.subscribe, connection.getSnapshot);
  const failed = [...remote.values()].some((participant) => participant.state === "failed");
  const mediaSupported = typeof RTCPeerConnection !== "undefined";
  const tiles: CallVideoTile[] = session.participants.flatMap((participant) => {
    const member = members.find((candidate) => candidate.id === participant.userId);
    if (!member) return [];
    const local = participant.sessionId === session.sessionId;
    const peer = remote.get(participant.sessionId);
    const camera = local ? media.streams.camera : participant.camera ? peer?.camera : undefined;
    return [{ id: participant.sessionId, name: local ? "You" : member.name, background: `${member.color}22`,
      content: <>{camera ? <MeetingVideo stream={camera} mirror={local} label={`${local ? "Your" : member.name + "’s"} camera`} />
        : <Avatar member={member} className="video-avatar" />}
        {!local && peer && <MeetingAudio stream={peer.audio} name={member.name} />}</>,
      details: !(local ? media.streams.microphone : participant.microphone) && <MicOff size={14} aria-label="Microphone off" /> }];
  });

  useEffect(() => { connection.start(); }, [connection]);
  useEffect(() => { connection.setStreams(media.streams); }, [connection, media.streams]);

  return <div className={expanded ? "call-backdrop" : "call-window-layer"}><section ref={callRef} className={`proximity-call${expanded ? " proximity-call-expanded" : ""}`}
    role={expanded ? "dialog" : undefined} aria-modal={expanded || undefined} aria-label="Open call" tabIndex={expanded ? -1 : undefined}>
      <header><strong>Open call</strong><div className="proximity-call-actions">
        {expanded && <button aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} onClick={() => void toggleFullscreen()}>{fullscreen ? <Shrink size={18} /> : <Expand size={18} />}</button>}
        <button aria-label={expanded ? "Minimize call" : "Expand call"} onClick={() => { if (fullscreen) void document.exitFullscreen(); setSettingsOpen(false); setExpanded(!expanded); }}>{expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
        <button aria-label="Call settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}><Settings size={18} /></button>
        {!expanded && <button className="leave-call" aria-label="Leave conversation" onClick={onLeave}><PhoneOff size={18} /></button>}
      </div></header>
      {media.errors.length > 0 && <div role="alert">{media.errors.map((error) => <p key={error}>{error}</p>)}</div>}
      {fullscreenError && <p role="alert">{fullscreenError}</p>}
      {failed && <p role="alert">Connection interrupted. <button onClick={() => connection.retry()}>Retry</button></p>}
      {settingsOpen && <MediaDeviceSettings media={media} />}
      <CallVideoStage tiles={tiles} expanded={expanded} className="proximity-call-videos" />
      {expanded && <footer className="meeting-controls proximity-call-controls">
        <button disabled={!mediaSupported} className={muted ? "is-off" : ""} aria-label={muted ? "Unmute" : "Mute"} onClick={() => onMutedChange(!muted)}>{muted ? <MicOff size={20} /> : <Mic size={20} />}</button>
        <button disabled={!mediaSupported} className={cameraOn ? "" : "is-off"} aria-label={cameraOn ? "Turn camera off" : "Turn camera on"} onClick={() => onCameraChange(!cameraOn)}>{cameraOn ? <Camera size={20} /> : <CameraOff size={20} />}</button>
        <button className="leave-call" aria-label="Leave conversation" onClick={onLeave}><PhoneOff size={20} /></button>
      </footer>}
    </section></div>;
}
