import { useLocalMedia } from "../hooks/useLocalMedia";

interface ProximityMediaProps {
  active: boolean;
  microphone: boolean;
  camera: boolean;
  onUnavailable: () => void;
  onMediaChange: (microphone: boolean, camera: boolean) => void;
}

export function ProximityMedia({ active, microphone, camera, onUnavailable, onMediaChange }: ProximityMediaProps) {
  useLocalMedia({ active, microphone, camera, onUnavailable, onMediaChange });
  return null;
}
