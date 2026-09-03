import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AuthUser, Member } from "@workhard/shared";
import type {
  ApplicationDatabase,
  AuthPersistenceState,
  PersistedAuthAccount,
} from "../persistence/application-database.js";
import { DUMMY_PASSWORD_HASH, SEEDED_PASSWORD_HASH, hashPassword, verifyPassword } from "./passwords.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const MAGIC_LINK_TTL_MS = 15 * 60 * 1_000;

type Account = PersistedAuthAccount;
type AuthState = AuthPersistenceState;

interface AuthStoreOptions {
  database: ApplicationDatabase;
  members: Member[];
}

export interface RegisteredAccount {
  user: AuthUser;
  sessionToken: string;
}

export interface MagicLink {
  email: string;
  token: string;
  expiresAt: string;
}

export class AuthStore {
  private state: AuthState;
  private saveQueue = Promise.resolve();
  private registrationQueue = Promise.resolve();

  private constructor(private readonly options: AuthStoreOptions, state: AuthState) {
    this.state = state;
  }

  static async create(options: AuthStoreOptions): Promise<AuthStore> {
    const saved = await options.database.loadAuthState();
    const state = saved ?? createSeedState(options.members);
    if (!saved && state.accounts.length > 0) {
      await options.database.saveAuthState(state);
    }
    return new AuthStore(options, state);
  }

  getUserFromSession(token: string | undefined): AuthUser | undefined {
    if (!token) {
      return undefined;
    }
    this.removeExpiredRecords();
    const tokenHash = hashToken(token);
    const session = this.state.sessions.find((candidate) => candidate.tokenHash === tokenHash);
    return session ? this.publicUser(this.state.accounts.find((account) => account.id === session.userId)) : undefined;
  }

  async register(username: string, email: string, password: string, userId = randomUUID()): Promise<RegisteredAccount> {
    const operation = this.registrationQueue.then(() => this.performRegistration(username, email, password, userId));
    this.registrationQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async performRegistration(username: string, email: string, password: string, userId: string): Promise<RegisteredAccount> {
    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = normalizeEmail(email);
    if (this.state.accounts.some((account) => account.username === normalizedUsername)) {
      throw new Error("USERNAME_TAKEN");
    }
    if (this.state.accounts.some((account) => account.email === normalizedEmail)) {
      throw new Error("EMAIL_TAKEN");
    }
    const account: Account = {
      id: userId,
      username: normalizedUsername,
      email: normalizedEmail,
      passwordHash: await hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    this.state.accounts.push(account);
    const sessionToken = this.addSession(account.id);
    await this.persist();
    return { user: this.publicUser(account)!, sessionToken };
  }

  async removeAccount(userId: string): Promise<void> {
    this.state.accounts = this.state.accounts.filter((account) => account.id !== userId);
    this.state.sessions = this.state.sessions.filter((session) => session.userId !== userId);
    this.state.magicLinks = this.state.magicLinks.filter((request) => request.userId !== userId);
    await this.persist();
  }

  async authenticate(identifier: string, password: string): Promise<RegisteredAccount | undefined> {
    const normalizedIdentifier = identifier.normalize("NFKC").trim().toLowerCase();
    const account = this.state.accounts.find(
      (candidate) => candidate.username === normalizedIdentifier || candidate.email === normalizedIdentifier,
    );
    const valid = await verifyPassword(password, account?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!account || !valid) {
      return undefined;
    }
    const sessionToken = this.addSession(account.id);
    await this.persist();
    return { user: this.publicUser(account)!, sessionToken };
  }

  async createMagicLink(email: string): Promise<MagicLink | undefined> {
    this.removeExpiredRecords();
    const normalizedEmail = normalizeEmail(email);
    const account = this.state.accounts.find((candidate) => candidate.email === normalizedEmail);
    if (!account) {
      return undefined;
    }
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS).toISOString();
    this.state.magicLinks = this.state.magicLinks.filter((request) => request.userId !== account.id);
    this.state.magicLinks.push({ tokenHash: hashToken(token), userId: account.id, expiresAt });
    await this.persist();
    return { email: account.email, token, expiresAt };
  }

  async consumeMagicLink(token: string): Promise<RegisteredAccount | undefined> {
    this.removeExpiredRecords();
    const tokenHash = hashToken(token);
    const request = this.state.magicLinks.find((candidate) => candidate.tokenHash === tokenHash);
    if (!request) {
      return undefined;
    }
    const account = this.state.accounts.find((candidate) => candidate.id === request.userId);
    this.state.magicLinks = this.state.magicLinks.filter((candidate) => candidate.tokenHash !== tokenHash);
    if (!account) {
      await this.persist();
      return undefined;
    }
    const sessionToken = this.addSession(account.id);
    await this.persist();
    return { user: this.publicUser(account)!, sessionToken };
  }

  async revokeSession(token: string | undefined): Promise<void> {
    if (!token) {
      return;
    }
    const tokenHash = hashToken(token);
    this.state.sessions = this.state.sessions.filter((session) => session.tokenHash !== tokenHash);
    await this.persist();
  }

  async close(): Promise<void> {
    await this.saveQueue;
  }

  private addSession(userId: string): string {
    this.removeExpiredRecords();
    const token = randomBytes(32).toString("base64url");
    this.state.sessions.push({
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    });
    return token;
  }

  private removeExpiredRecords(): void {
    const now = Date.now();
    this.state.sessions = this.state.sessions.filter((session) => Date.parse(session.expiresAt) > now);
    this.state.magicLinks = this.state.magicLinks.filter((request) => Date.parse(request.expiresAt) > now);
  }

  private publicUser(account: Account | undefined): AuthUser | undefined {
    return account ? { id: account.id, username: account.username, email: account.email } : undefined;
  }

  private persist(): Promise<void> {
    const snapshot = structuredClone(this.state);
    const operation = this.saveQueue.then(() => this.options.database.saveAuthState(snapshot));
    this.saveQueue = operation.catch(() => undefined);
    return operation;
  }
}

export function normalizeUsername(username: string): string {
  return username.normalize("NFKC").trim().toLowerCase();
}

export function normalizeEmail(email: string): string {
  return email.normalize("NFC").trim().toLowerCase();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createSeedState(members: Member[]): AuthState {
  const createdAt = new Date().toISOString();
  return {
    accounts: members.map((member) => ({
      id: member.id,
      username: member.email.split("@")[0]!.toLowerCase(),
      email: normalizeEmail(member.email),
      passwordHash: SEEDED_PASSWORD_HASH,
      createdAt,
    })),
    sessions: [],
    magicLinks: [],
  };
}
