import type { useMediaDevices } from "../hooks/useMediaDevices";
import "../media-device-settings.css";

interface MediaDeviceSettingsProps {
  media: Pick<ReturnType<typeof useMediaDevices>, "devices" | "microphoneId" | "setMicrophoneId" | "cameraId" | "setCameraId" | "noiseSuppression" | "setNoiseSuppression">;
  disabled?: boolean;
}

export function MediaDeviceSettings({ media, disabled = false }: MediaDeviceSettingsProps) {
  return <div className="media-device-settings">
    <label>Microphone<select disabled={disabled} value={media.microphoneId} onChange={(event) => media.setMicrophoneId(event.target.value)}>
      <option value="">Default</option>{media.devices.filter((device) => device.kind === "audioinput" && device.deviceId).map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
    </select></label>
    <label>Camera<select disabled={disabled} value={media.cameraId} onChange={(event) => media.setCameraId(event.target.value)}>
      <option value="">Default</option>{media.devices.filter((device) => device.kind === "videoinput" && device.deviceId).map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
    </select></label>
    <label className="media-noise-setting"><input type="checkbox" disabled={disabled} checked={media.noiseSuppression} onChange={(event) => media.setNoiseSuppression(event.target.checked)} />Noise filtering</label>
  </div>;
}
