import type { AuthUser, WorldPlayer } from "@workhard/shared";
import type {
  BrandingLogoReference,
  BrandingLogoWrite,
  StoredBrandingLogo,
} from "../branding/branding-logo-record.js";
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
  getBrandingLogoReference(): Promise<BrandingLogoReference | undefined>;
  saveBrandingLogo(logo: BrandingLogoWrite): Promise<BrandingLogoReference>;
  readBrandingLogo(): Promise<StoredBrandingLogo | undefined>;
  removeBrandingLogo(): Promise<boolean>;
  clear(): Promise<void>;
  close(): Promise<void>;
}
