import { useEffect, useRef, useState } from "react";

export function MeetingVideo({ stream, mirror = false, label }: { stream: MediaStream; mirror?: boolean; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    return () => { video.srcObject = null; };
  }, [stream]);
  return <video ref={ref} autoPlay muted playsInline className={mirror ? "mirror-camera" : ""} aria-label={label} />;
}

export function MeetingAudio({ stream, name }: { stream: MediaStream; name: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [blocked, setBlocked] = useState(false);
  const trackIds = stream.getAudioTracks().map((track) => track.id).join("|");
  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    let active = true;
    audio.srcObject = stream;
    setBlocked(false);
    if (trackIds) void audio.play().then(() => { if (active) setBlocked(false); }).catch(() => { if (active) setBlocked(true); });
    return () => { active = false; audio.srcObject = null; };
  }, [stream, trackIds]);
  return <><audio ref={ref} autoPlay />{blocked && <button className="meeting-play-audio" onClick={() => {
    void ref.current?.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
  }}>Play {name}’s audio</button>}</>;
}
