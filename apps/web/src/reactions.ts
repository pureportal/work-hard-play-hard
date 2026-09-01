import type { ReactionKind, ReactionScope } from "@workhard/shared";

export interface ReactionOption {
  kind: ReactionKind;
  emoji: string;
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

export interface DisplayHighFive {
  id: string;
  userIds: [string, string];
  floorId: string;
  expiresAt: number;
}

export const REACTION_OPTIONS: ReactionOption[] = [
  { kind: "wave", emoji: "👋", label: "Wave", shortcut: "1" },
  { kind: "heart", emoji: "❤️", label: "Heart", shortcut: "2" },
  { kind: "celebrate", emoji: "🎉", label: "Celebrate", shortcut: "3" },
  { kind: "thumbs_up", emoji: "👍", label: "Thumbs up", shortcut: "4" },
  { kind: "laugh", emoji: "😂", label: "Laugh", shortcut: "5" },
  { kind: "clap", emoji: "👏", label: "Clap", shortcut: "6" },
];

export const REACTION_EMOJI: Record<ReactionKind, string> = {
  wave: "👋",
  heart: "❤️",
  celebrate: "🎉",
  thumbs_up: "👍",
  laugh: "😂",
  clap: "👏",
};

export const REACTION_LABEL: Record<ReactionKind, string> = {
  wave: "Wave",
  heart: "Heart",
  celebrate: "Celebrate",
  thumbs_up: "Thumbs up",
  laugh: "Laugh",
  clap: "Clap",
};
