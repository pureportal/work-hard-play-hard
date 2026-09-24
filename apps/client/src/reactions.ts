import type { GroupReactionKind, ReactionKind, ReactionScope } from "@workhard/shared";
import waveIcon from "./assets/reactions/wave.svg?url";
import heartIcon from "./assets/reactions/heart.svg?url";
import celebrateIcon from "./assets/reactions/celebrate.svg?url";
import thumbsUpIcon from "./assets/reactions/thumbs_up.svg?url";
import laughIcon from "./assets/reactions/laugh.svg?url";
import clapIcon from "./assets/reactions/clap.svg?url";

export interface ReactionOption {
  kind: ReactionKind;
  icon: string;
  label: string;
  shortcut: string;
}

export interface DisplayReaction {
  id: string;
  userId: string;
  reaction: ReactionKind;
  scope: ReactionScope;
  expiresAt: number;
}

export interface DisplayGroupReaction {
  id: string;
  kind: GroupReactionKind;
  userIds: [string, string];
  floorId: string;
  expiresAt: number;
}

export const REACTION_OPTIONS: ReactionOption[] = [
  { kind: "wave", icon: waveIcon, label: "Wave", shortcut: "1" },
  { kind: "heart", icon: heartIcon, label: "Heart", shortcut: "2" },
  { kind: "celebrate", icon: celebrateIcon, label: "Celebrate", shortcut: "3" },
  { kind: "thumbs_up", icon: thumbsUpIcon, label: "Thumbs up", shortcut: "4" },
  { kind: "laugh", icon: laughIcon, label: "Laugh", shortcut: "5" },
  { kind: "clap", icon: clapIcon, label: "Clap", shortcut: "6" },
];

export const REACTION_ICON: Record<ReactionKind, string> = Object.fromEntries(
  REACTION_OPTIONS.map(({ kind, icon }) => [kind, icon]),
) as Record<ReactionKind, string>;

export const REACTION_LABEL: Record<ReactionKind, string> = {
  wave: "Wave",
  heart: "Heart",
  celebrate: "Celebrate",
  thumbs_up: "Thumbs up",
  laugh: "Laugh",
  clap: "Clap",
};
