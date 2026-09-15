import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { ClientCommand, ProximityMediaSession, ServerEvent } from "@workhard/shared";
import { MediaConnection } from "../media-connection";

export function useProximitySession(send: RefObject<(command: ClientCommand) => boolean>, onMutedChange: (muted: boolean) => void, onCameraChange: (enabled: boolean) => void) {
  const current = useRef<MediaConnection<ProximityMediaSession> | undefined>(undefined);
  const [connection, setConnection] = useState<MediaConnection<ProximityMediaSession>>();

  const stop = useCallback(() => {
    const media = current.current;
    if (!media) return;
    current.current = undefined;
    media.close();
    setConnection(undefined);
    send.current({ type: "proximity.leave", requestId: crypto.randomUUID(), sessionId: media.getSnapshot().session.sessionId });
  }, [send]);

  const leave = useCallback(() => {
    stop();
    onMutedChange(true);
    onCameraChange(false);
  }, [stop, onMutedChange, onCameraChange]);

  const start = useCallback(() => {
    if (current.current) return;
    const media = new MediaConnection<ProximityMediaSession>({ sessionId: crypto.randomUUID(), callId: null, participants: [], iceServers: [] }, (command) => send.current(command));
    current.current = media;
    setConnection(media);
  }, [send]);

  const handle = useCallback((event: ServerEvent) => {
    if (event.type === "proximity.left") {
      if (event.sessionId === current.current?.getSnapshot().session.sessionId) {
        leave();
        return true;
      }
    } else current.current?.handle(event);
    return false;
  }, [leave]);

  useEffect(() => () => {
    const media = current.current;
    if (!media) return;
    current.current = undefined;
    media.close();
    send.current({ type: "proximity.leave", requestId: crypto.randomUUID(), sessionId: media.getSnapshot().session.sessionId });
  }, [send]);

  return { connection, start, stop, leave, handle };
}
