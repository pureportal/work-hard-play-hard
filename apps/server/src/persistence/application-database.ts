import type { AuthUser, GameGuideStatus, WorldPlayer } from "@workhard/shared";
import type { SpotifyConnectionRecord } from "../spotify/spotify-record.js";
import type { GitHubConnectionRecord } from "../github/github-record.js";
import type {
  BrandingLogoReference,
  BrandingLogoWrite,
  StoredBrandingLogo,
} from "../branding/branding-logo-record.js";
import type { MutableStoreState } from "../store.js";
import type { WhiteboardImageWrite } from "../work/whiteboard-image-record.js";

export interface PersistedAuthAccount extends AuthUser {
  passwordHash: string;
  createdAt: string;
}

export interface PersistedAuthToken {
  tokenHash: string;
  userId: string;
  expiresAt: string;
}

export interface PersistedRegistrationLink {
  tokenHash: string;
  username: string;
  email: string;
  passwordHash: string;
  expiresAt: string;
}

export interface AuthPersistenceState {
  accounts: PersistedAuthAccount[];
  sessions: PersistedAuthToken[];
  magicLinks: PersistedAuthToken[];
  passwordResets: PersistedAuthToken[];
  registrationLinks: PersistedRegistrationLink[];
}

export interface WorkspacePersistenceState {
  players: WorldPlayer[];
  store: MutableStoreState;
}

export interface ApplicationDatabase {
  loadGameGuideStatus(userId: string): Promise<GameGuideStatus | null>;
  saveGameGuideStatus(userId: string, status: GameGuideStatus): Promise<void>;
  saveChatImage(id: string, image: Buffer): Promise<void>;
  readChatImage(id: string): Promise<Buffer | undefined>;
  removeChatImage(id: string): Promise<void>;
  loadGitHubConnections(): Promise<GitHubConnectionRecord[]>;
  saveGitHubConnection(record: GitHubConnectionRecord): Promise<void>;
  removeGitHubConnection(userId: string): Promise<void>;
  saveWhiteboardImage(image: WhiteboardImageWrite): Promise<void>;
  retainWhiteboardImages(objectId: string, imageIds: string[]): Promise<boolean>;
  readWhiteboardImage(id: string): Promise<Buffer | undefined>;
  cleanupWhiteboardImages(): Promise<void>;
  loadSpotifyConnections(): Promise<SpotifyConnectionRecord[]>;
  saveSpotifyConnection(record: SpotifyConnectionRecord): Promise<void>;
  removeSpotifyConnection(userId: string): Promise<void>;
  isHealthy(): Promise<boolean>;
  loadWorkspaceState(): Promise<WorkspacePersistenceState | undefined>;
  saveWorkspaceState(state: WorkspacePersistenceState): Promise<void>;
  loadAuthState(): Promise<AuthPersistenceState | undefined>;
  saveAuthState(state: AuthPersistenceState): Promise<void>;
  getBrandingLogoReference(): Promise<BrandingLogoReference | undefined>;
  saveBrandingLogo(logo: BrandingLogoWrite): Promise<BrandingLogoReference>;
  readBrandingLogo(): Promise<StoredBrandingLogo | undefined>;
  removeBrandingLogo(): Promise<boolean>;
  clear(): Promise<void>;
  close(): Promise<void>;
}
