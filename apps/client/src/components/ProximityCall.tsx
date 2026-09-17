import { PhoneOff, Settings } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Member, ProximityMediaSession } from "@workhard/shared";
import { useMediaDevices } from "../hooks/useMediaDevices";
import type { MediaConnection } from "../media-connection";
import { Avatar } from "./Avatar";
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
  const media = useMediaDevices(muted, cameraOn, onMutedChange, onCameraChange);
  const { session, remote } = useSyncExternalStore(connection.subscribe, connection.getSnapshot);
  const failed = [...remote.values()].some((participant) => participant.state === "failed");

  useEffect(() => { connection.start(); }, [connection]);
  useEffect(() => { connection.setStreams(media.streams); }, [connection, media.streams]);

  return <section className="proximity-call" aria-label="Open call">
      <header><strong>Open call</strong><div className="proximity-call-actions">
        <button aria-label="Call settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}><Settings size={18} /></button>
        <button className="leave-call" aria-label="Leave conversation" onClick={onLeave}><PhoneOff size={18} /></button>
      </div></header>
      {media.errors.length > 0 && <div role="alert">{media.errors.map((error) => <p key={error}>{error}</p>)}</div>}
      {failed && <p role="alert">Connection interrupted. <button onClick={() => connection.retry()}>Retry</button></p>}
      {settingsOpen && <MediaDeviceSettings media={media} />}
      <div className="proximity-call-videos">
        {session.participants.map((participant) => {
          const member = members.find((candidate) => candidate.id === participant.userId);
          if (!member) return null;
          const local = participant.sessionId === session.sessionId;
          const peer = remote.get(participant.sessionId);
          const camera = local ? media.streams.camera : participant.camera ? peer?.camera : undefined;
          return <article className="video-tile" key={participant.sessionId}>
            {camera ? <MeetingVideo stream={camera} mirror={local} label={`${local ? "Your" : member.name + "’s"} camera`} /> : <Avatar member={member} className="video-avatar" />}
            {!local && peer && <MeetingAudio stream={peer.audio} name={member.name} />}
            <footer><strong>{local ? "You" : member.name}</strong></footer>
          </article>;
        })}
      </div>
    </section>;
}
