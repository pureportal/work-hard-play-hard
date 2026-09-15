import { PhoneOff } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import type { Member, ProximityMediaSession } from "@workhard/shared";
import { useMediaDevices } from "../hooks/useMediaDevices";
import type { MediaConnection } from "../media-connection";
import { Avatar } from "./Avatar";
import { MeetingAudio, MeetingVideo } from "./MeetingMediaElement";

interface ProximityCallProps {
  connection: MediaConnection<ProximityMediaSession>;
  members: Member[];
  muted: boolean;
  cameraOn: boolean;
  onMutedChange: (muted: boolean) => void;
  onCameraChange: (enabled: boolean) => void;
  onLeave: () => void;
  onError: (message: string) => void;
}

export function ProximityCall({ connection, members, muted, cameraOn, onMutedChange, onCameraChange, onLeave, onError }: ProximityCallProps) {
  const media = useMediaDevices(muted, cameraOn, onMutedChange, onCameraChange);
  const { session, remote } = useSyncExternalStore(connection.subscribe, connection.getSnapshot);
  const failed = [...remote.values()].some((participant) => participant.state === "failed");
  const error = media.errors.join(" ");

  useEffect(() => { connection.start(); }, [connection]);
  useEffect(() => { connection.setStreams(media.streams); }, [connection, media.streams]);
  useEffect(() => { if (error) onError(error); }, [error, onError]);

  return <>
    {session.callId && <section className="proximity-call" aria-label="Open call">
      <header><strong>Open call</strong><button className="leave-call" aria-label="Leave conversation" onClick={onLeave}><PhoneOff size={18} /></button></header>
      {failed && <p role="alert">Connection interrupted. <button onClick={() => connection.retry()}>Retry</button></p>}
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
    </section>}
  </>;
}
