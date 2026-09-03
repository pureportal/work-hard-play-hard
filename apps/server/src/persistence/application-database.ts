import type { AuthUser, WorldPlayer } from "@workhard/shared";
import type { AvatarReference, AvatarWrite, StoredAvatar } from "../avatar/avatar-record.js";
import type { MutableStoreState } from "../store.js";

export interface PersistedAuthAccount extends AuthUser {
  passwordHash: string;
  createdAt: string;
}

export interface PersistedAuthSession {
  tokenHash: string;
  userId: string;
  expiresAt: string;
}

export interface PersistedMagicLink {
  tokenHash: string;
  userId: string;
  expiresAt: string;
}

export interface AuthPersistenceState {
  accounts: PersistedAuthAccount[];
  sessions: PersistedAuthSession[];
  magicLinks: PersistedMagicLink[];
}

export interface WorkspacePersistenceState {
  players: WorldPlayer[];
  store: MutableStoreState;
}

export interface ApplicationDatabase {
  isHealthy(): Promise<boolean>;
  loadWorkspaceState(): Promise<WorkspacePersistenceState | undefined>;
  saveWorkspaceState(state: WorkspacePersistenceState): Promise<void>;
  loadAuthState(): Promise<AuthPersistenceState | undefined>;
  saveAuthState(state: AuthPersistenceState): Promise<void>;
  getAvatarReferences(): Promise<AvatarReference[]>;
  saveAvatar(userId: string, avatar: AvatarWrite): Promise<AvatarReference>;
  readAvatar(userId: string): Promise<StoredAvatar | undefined>;
  removeAvatar(userId: string): Promise<boolean>;
  clear(): Promise<void>;
  close(): Promise<void>;
}
