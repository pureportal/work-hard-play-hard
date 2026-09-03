import { useEffect, useRef, useState, type RefObject } from "react";

interface LocalMediaOptions {
  active: boolean;
  microphone: boolean;
  camera: boolean;
  videoRef?: RefObject<HTMLVideoElement | null>;
  onUnavailable: () => void;
  onMediaChange?: (microphone: boolean, camera: boolean) => void;
}

export function useLocalMedia({
  active,
  microphone,
  camera,
  videoRef,
  onUnavailable,
  onMediaChange,
}: LocalMediaOptions): boolean {
  const [unavailable, setUnavailable] = useState(false);
  const onUnavailableRef = useRef(onUnavailable);
  const onMediaChangeRef = useRef(onMediaChange);
  onUnavailableRef.current = onUnavailable;
  onMediaChangeRef.current = onMediaChange;

  useEffect(() => {
    if (!active || (!microphone && !camera)) {
      onMediaChangeRef.current?.(false, false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setUnavailable(true);
      onMediaChangeRef.current?.(false, false);
      onUnavailableRef.current();
      return;
    }

    let mounted = true;
    let stream: MediaStream | undefined;
    setUnavailable(false);
    void navigator.mediaDevices.getUserMedia({ audio: microphone, video: camera }).then((nextStream) => {
      stream = nextStream;
      if (!mounted) {
        nextStream.getTracks().forEach((track) => track.stop());
        return;
      }
      onMediaChangeRef.current?.(microphone, camera);
      if (camera && videoRef?.current) {
        videoRef.current.srcObject = nextStream;
      }
    }).catch(() => {
      if (mounted) {
        setUnavailable(true);
        onMediaChangeRef.current?.(false, false);
        onUnavailableRef.current();
      }
    });

    return () => {
      mounted = false;
      onMediaChangeRef.current?.(false, false);
      stream?.getTracks().forEach((track) => track.stop());
      const video = videoRef?.current;
      if (stream && video?.srcObject === stream) {
        video.srcObject = null;
      }
    };
  }, [active, camera, microphone, videoRef]);

  return unavailable;
}
