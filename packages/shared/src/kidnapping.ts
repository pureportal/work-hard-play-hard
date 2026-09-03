export const KIDNAPPING_POLICY_MODES = ["allow_all", "allow_list", "block_list", "allow_none"] as const;

export type KidnappingPolicyMode = typeof KIDNAPPING_POLICY_MODES[number];

export interface KidnappingPolicy {
  mode: KidnappingPolicyMode;
  userIds: string[];
}

export interface GlobalKidnappingSettings {
  enabled: boolean;
  targetPolicy: KidnappingPolicy;
}

export interface PlayerKidnappingSettings {
  carrierPolicy: KidnappingPolicy;
}

export interface KidnappingConfiguration {
  global: GlobalKidnappingSettings;
  player: PlayerKidnappingSettings;
}

export const DEFAULT_GLOBAL_KIDNAPPING_SETTINGS: GlobalKidnappingSettings = {
  enabled: true,
  targetPolicy: { mode: "allow_all", userIds: [] },
};

export const DEFAULT_PLAYER_KIDNAPPING_SETTINGS: PlayerKidnappingSettings = {
  carrierPolicy: { mode: "allow_all", userIds: [] },
};

export function kidnappingPolicyAllows(policy: KidnappingPolicy, userId: string): boolean {
  switch (policy.mode) {
    case "allow_all":
      return true;
    case "allow_list":
      return policy.userIds.includes(userId);
    case "block_list":
      return !policy.userIds.includes(userId);
    case "allow_none":
      return false;
  }
}
