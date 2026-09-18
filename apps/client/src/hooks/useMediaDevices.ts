import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MediaStreams } from "../media-connection";

function useCaptureDevice(enabled: boolean, kind: "microphone" | "camera", deviceId: string, noiseSuppression: boolean, onDisabled: () => void) {
  const [stream, setStream] = useState<MediaStream>();
  const [error, setError] = useState<string>();
  const disabledRef = useRef(onDisabled);
  disabledRef.current = onDisabled;

  useEffect(() => {
    setStream(undefined);
    if (!enabled) return;
    let active = true;
    let captured: MediaStream | undefined;
    setError(undefined);
    const capture = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
        const selection = deviceId ? { deviceId: { exact: deviceId } } : {};
        captured = await navigator.mediaDevices.getUserMedia(kind === "microphone"
          ? { audio: { ...selection, echoCancellation: true, noiseSuppression, autoGainControl: true, channelCount: 1 }, video: false }
          : { audio: false, video: { ...selection, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } } });
        if (!active) {
          captured.getTracks().forEach((track) => track.stop());
          return;
        }
        for (const track of captured.getTracks()) {
          track.contentHint = kind === "microphone" ? "speech" : "motion";
          track.onended = () => {
            if (!active) return;
            setStream(undefined);
            setError(`${kind === "microphone" ? "Microphone" : "Camera"} disconnected. Choose a device and try again.`);
            disabledRef.current();
          };
        }
        setStream(captured);
      } catch (reason) {
        if (!active) return;
        const name = reason instanceof DOMException || reason instanceof Error ? reason.name : "";
        const label = kind === "microphone" ? "Microphone" : "Camera";
        setError(name === "NotAllowedError" ? `${label} blocked. Allow access in your browser and try again.`
          : name === "NotFoundError" || name === "OverconstrainedError" ? `${label} not found. Choose another device.`
            : `${label} unavailable. Check your device and browser permissions, then try again.`);
        disabledRef.current();
      }
    };
    void capture();
    return () => {
      active = false;
      captured?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    };
  }, [enabled, kind, deviceId, noiseSuppression]);

  return { stream, error };
}

export function useMediaDevices(muted: boolean, cameraOn: boolean, onMutedChange: (muted: boolean) => void, onCameraChange: (enabled: boolean) => void) {
  const [microphoneId, setMicrophoneId] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const microphone = useCaptureDevice(!muted, "microphone", microphoneId, noiseSuppression, () => onMutedChange(true));
  const camera = useCaptureDevice(cameraOn, "camera", cameraId, true, () => onCameraChange(false));
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [screen, setScreen] = useState<MediaStream>();
  const [sharingPending, setSharingPending] = useState(false);
  const [screenError, setScreenError] = useState<string>();
  const screenRef = useRef<MediaStream | undefined>(undefined);
  const captureGeneration = useRef(0);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    const media = navigator.mediaDevices;
    if (!media?.enumerateDevices) return;
    let active = true;
    let generation = 0;
    const update = () => {
      const request = ++generation;
      void media.enumerateDevices().then((next) => {
        if (active && request === generation) setDevices(next);
      }).catch(() => {
        if (active && request === generation) setDevices([]);
      });
    };
    update();
    media.addEventListener("devicechange", update);
    return () => { active = false; media.removeEventListener("devicechange", update); };
  }, [microphone.stream, camera.stream]);

  const stopSharing = useCallback(() => {
    captureGeneration.current += 1;
    screenRef.current?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    screenRef.current = undefined;
    setScreen(undefined);
  }, []);

  const startSharing = async () => {
    if (pendingRef.current || screenRef.current) return;
    const generation = ++captureGeneration.current;
    pendingRef.current = true;
    setSharingPending(true);
    setScreenError(undefined);
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("unsupported");
      const captured = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: true });
      if (captureGeneration.current !== generation) {
        captured.getTracks().forEach((track) => track.stop());
        return;
      }
      const track = captured.getVideoTracks()[0];
      if (!track) { captured.getTracks().forEach((item) => item.stop()); throw new Error("missing screen"); }
      track.contentHint = "detail";
      track.onended = stopSharing;
      screenRef.current = captured;
      setScreen(captured);
    } catch (reason) {
      const name = reason instanceof DOMException || reason instanceof Error ? reason.name : "";
      if (captureGeneration.current === generation && name !== "NotAllowedError") {
        setScreenError("Screen sharing failed. Choose a screen or window and try again.");
      }
    } finally {
      pendingRef.current = false;
      if (mountedRef.current) setSharingPending(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      captureGeneration.current += 1;
      screenRef.current?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    };
  }, []);

  const streams: MediaStreams = useMemo(() => ({ ...(microphone.stream ? { microphone: microphone.stream } : {}),
    ...(camera.stream ? { camera: camera.stream } : {}), ...(screen ? { screen } : {}) }), [microphone.stream, camera.stream, screen]);

  return { streams, errors: [microphone.error, camera.error, screenError].filter((error): error is string => Boolean(error)),
    devices, microphoneId, setMicrophoneId, cameraId, setCameraId, noiseSuppression, setNoiseSuppression,
    sharingPending, startSharing, stopSharing };
}
