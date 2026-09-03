import { Camera, CameraOff, Mic, MicOff } from "lucide-react";
import type { Availability, Member, ReactionKind } from "@workhard/shared";
import { Avatar } from "./Avatar";
import { IconButton } from "./IconButton";
import { ReactionPicker } from "./ReactionPicker";

interface DockProps {
  currentUser: Member;
  muted: boolean;
  cameraOn: boolean;
  onMutedChange: (muted: boolean) => void;
  onCameraChange: (enabled: boolean) => void;
  onAvailabilityChange: (availability: Availability) => void;
  onReact: (reaction: ReactionKind) => void;
  reactionsDisabled: boolean;
}

export function Dock({
  currentUser,
  muted,
  cameraOn,
  onMutedChange,
  onCameraChange,
  onAvailabilityChange,
  onReact,
  reactionsDisabled,
}: DockProps) {
  return (
    <div className="control-dock" aria-label="Controls">
      <IconButton
        label={muted ? "Unmute" : "Mute"}
        icon={muted ? MicOff : Mic}
        className={muted ? "is-off" : ""}
        onClick={() => onMutedChange(!muted)}
      />
      <IconButton
        label={cameraOn ? "Turn camera off" : "Turn camera on"}
        icon={cameraOn ? Camera : CameraOff}
        className={cameraOn ? "" : "is-off"}
        onClick={() => onCameraChange(!cameraOn)}
      />
      <ReactionPicker onReact={onReact} disabled={reactionsDisabled} />
      <span className="dock-divider" />
      <label className="availability-picker">
        <span className={`status-dot ${currentUser.availability}`} aria-hidden="true" />
        <select
          aria-label="Availability"
          value={currentUser.availability}
          onChange={(event) => onAvailabilityChange(event.target.value as Availability)}
        >
          <option value="available">Available</option>
          <option value="busy">Busy</option>
          <option value="dnd">Do not disturb</option>
          <option value="away">Away</option>
        </select>
      </label>
      <Avatar member={currentUser} className="dock-avatar" />
    </div>
  );
}
