export interface SpotifyAppSettings {
  clientId: string;
  redirectUri: string;
}

export interface SpotifyAdminSettings extends SpotifyAppSettings {
  encryptionReady: boolean;
}

export interface GitHubAppSettings {
  clientId: string;
  appSlug: string;
  redirectUri: string;
}

export interface GitHubAppSettingsUpdate extends GitHubAppSettings {
  clientSecret?: string;
}

export interface GitHubAdminSettings extends GitHubAppSettings {
  hasClientSecret: boolean;
  encryptionReady: boolean;
  needsApply: boolean;
}
