import type { GitHubAppSettings } from "@workhard/shared";

export interface GitHubAppSettingsRecord extends GitHubAppSettings {
  encryptedClientSecret: string | null;
  connectionsResetPending: boolean;
}

export interface GitHubConnectionRecord {
  userId: string;
  encryptedTokens: string | null;
  login: string | null;
}
