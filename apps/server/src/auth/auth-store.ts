import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AuthUser } from "@workhard/shared";
import type { ApplicationDatabase, AuthPersistenceState, PersistedAuthAccount } from "../persistence/application-database.js";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "./passwords.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const EMAIL_LINK_TTL_MS = 15 * 60 * 1_000;

interface AuthStoreOptions {
  database: ApplicationDatabase;
}

export interface RegisteredAccount {
  user: AuthUser;
  sessionToken: string;
}

export interface EmailLink {
  email: string;
  token: string;
  expiresAt: string;
}

export class AuthStore {
  private mutationQueue = Promise.resolve();

  private constructor(private readonly options: AuthStoreOptions, private state: AuthPersistenceState) {}

  static async create(options: AuthStoreOptions): Promise<AuthStore> {
    const state = await options.database.loadAuthState()
      ?? { accounts: [], sessions: [], magicLinks: [], passwordResets: [], registrationLinks: [] };
    return new AuthStore(options, state);
  }

  getUserFromSession(token: string | undefined): AuthUser | undefined {
    if (!token) return undefined;
    const tokenHash = hashToken(token);
    const session = this.state.sessions.find((candidate) => candidate.tokenHash === tokenHash && Date.parse(candidate.expiresAt) > Date.now());
    const account = session && this.state.accounts.find((candidate) => candidate.id === session.userId);
    return account ? publicUser(account) : undefined;
  }

  async register(username: string, email: string, password: string, userId = randomUUID()): Promise<RegisteredAccount> {
    return this.update(async (state) => {
      const normalizedUsername = normalizeUsername(username);
      const normalizedEmail = normalizeEmail(email);
      assertAccountAvailable(state, normalizedUsername, normalizedEmail);
      return addAccount(state, normalizedUsername, normalizedEmail, await hashPassword(password), userId);
    });
  }

  async removeAccount(userId: string): Promise<void> {
    await this.update((state) => {
      state.accounts = state.accounts.filter((account) => account.id !== userId);
      state.sessions = state.sessions.filter((session) => session.userId !== userId);
      state.magicLinks = state.magicLinks.filter((request) => request.userId !== userId);
      state.passwordResets = state.passwordResets.filter((request) => request.userId !== userId);
    });
  }

  async authenticate(identifier: string, password: string): Promise<RegisteredAccount | undefined> {
    return this.update(async (state) => {
      const normalizedIdentifier = identifier.includes("@") ? normalizeEmail(identifier) : normalizeUsername(identifier);
      const account = state.accounts.find((candidate) => candidate.username === normalizedIdentifier || candidate.email === normalizedIdentifier);
      const valid = await verifyPassword(password, account?.passwordHash ?? DUMMY_PASSWORD_HASH);
      if (!account || !valid) return undefined;
      return { user: publicUser(account), sessionToken: addSession(state, account.id) };
    });
  }

  async createMagicLink(email: string): Promise<EmailLink | undefined> {
    return this.createAccountLink("magicLinks", email);
  }

  async createPasswordReset(email: string): Promise<EmailLink | undefined> {
    return this.createAccountLink("passwordResets", email);
  }

  private async createAccountLink(collection: "magicLinks" | "passwordResets", email: string): Promise<EmailLink | undefined> {
    return this.update((state) => {
      const account = state.accounts.find((candidate) => candidate.email === normalizeEmail(email));
      if (!account) return undefined;
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + EMAIL_LINK_TTL_MS).toISOString();
      state[collection] = state[collection].filter((request) => request.userId !== account.id);
      state[collection].push({ tokenHash: hashToken(token), userId: account.id, expiresAt });
      return { email: account.email, token, expiresAt };
    });
  }

  async consumeMagicLink(token: string): Promise<RegisteredAccount | undefined> {
    return this.update((state) => {
      const tokenHash = hashToken(token);
      const request = state.magicLinks.find((candidate) => candidate.tokenHash === tokenHash);
      if (!request) return undefined;
      state.magicLinks = state.magicLinks.filter((candidate) => candidate.tokenHash !== tokenHash);
      const account = state.accounts.find((candidate) => candidate.id === request.userId);
      return account ? { user: publicUser(account), sessionToken: addSession(state, account.id) } : undefined;
    });
  }

  async resetPassword(token: string, password: string): Promise<AuthUser | undefined> {
    return this.update(async (state) => {
      const request = state.passwordResets.find((candidate) => candidate.tokenHash === hashToken(token));
      if (!request) return undefined;
      const account = state.accounts.find((candidate) => candidate.id === request.userId);
      if (!account) return undefined;
      const passwordHash = await hashPassword(password);
      if (Date.parse(request.expiresAt) <= Date.now()) return undefined;
      account.passwordHash = passwordHash;
      state.passwordResets = state.passwordResets.filter((candidate) => candidate.userId !== account.id);
      state.magicLinks = state.magicLinks.filter((candidate) => candidate.userId !== account.id);
      state.sessions = state.sessions.filter((candidate) => candidate.userId !== account.id);
      return publicUser(account);
    });
  }

  async createRegistrationLink(username: string, email: string, password: string): Promise<EmailLink> {
    return this.update(async (state) => {
      const normalizedUsername = normalizeUsername(username);
      const normalizedEmail = normalizeEmail(email);
      assertAccountAvailable(state, normalizedUsername, normalizedEmail);
      const passwordHash = await hashPassword(password);
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + EMAIL_LINK_TTL_MS).toISOString();
      state.registrationLinks = state.registrationLinks.filter((candidate) => candidate.email !== normalizedEmail);
      state.registrationLinks.push({ tokenHash: hashToken(token), username: normalizedUsername, email: normalizedEmail, passwordHash, expiresAt });
      return { email: normalizedEmail, token, expiresAt };
    });
  }

  async consumeRegistrationLink(token: string, assertAllowed: (email: string) => void): Promise<RegisteredAccount | undefined> {
    return this.update((state) => {
      const request = state.registrationLinks.find((candidate) => candidate.tokenHash === hashToken(token));
      if (!request) return undefined;
      assertAllowed(request.email);
      assertAccountAvailable(state, request.username, request.email);
      return addAccount(state, request.username, request.email, request.passwordHash, randomUUID());
    });
  }

  async revokeEmailLink(collection: "magicLinks" | "passwordResets" | "registrationLinks", token: string): Promise<void> {
    await this.update((state) => {
      const tokenHash = hashToken(token);
      if (collection === "registrationLinks") {
        state.registrationLinks = state.registrationLinks.filter((candidate) => candidate.tokenHash !== tokenHash);
      } else {
        state[collection] = state[collection].filter((candidate) => candidate.tokenHash !== tokenHash);
      }
    });
  }

  async revokeSession(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.update((state) => {
      state.sessions = state.sessions.filter((session) => session.tokenHash !== hashToken(token));
    });
  }

  async close(): Promise<void> {
    await this.mutationQueue;
  }

  private update<T>(mutate: (state: AuthPersistenceState) => T | Promise<T>): Promise<T> {
    const operation = this.mutationQueue.then(async () => {
      const next = structuredClone(this.state);
      const now = Date.now();
      next.sessions = next.sessions.filter((record) => Date.parse(record.expiresAt) > now);
      next.magicLinks = next.magicLinks.filter((record) => Date.parse(record.expiresAt) > now);
      next.passwordResets = next.passwordResets.filter((record) => Date.parse(record.expiresAt) > now);
      next.registrationLinks = next.registrationLinks.filter((record) => Date.parse(record.expiresAt) > now);
      const result = await mutate(next);
      await this.options.database.saveAuthState(next);
      this.state = next;
      return result;
    });
    this.mutationQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }
}

function assertAccountAvailable(state: AuthPersistenceState, username: string, email: string): void {
  if (state.accounts.some((account) => account.username === username)) throw new Error("USERNAME_TAKEN");
  if (state.accounts.some((account) => account.email === email)) throw new Error("EMAIL_TAKEN");
}

function addAccount(state: AuthPersistenceState, username: string, email: string, passwordHash: string, id: string): RegisteredAccount {
  const account = { id, username, email, passwordHash, createdAt: new Date().toISOString() };
  state.accounts.push(account);
  state.registrationLinks = state.registrationLinks.filter((candidate) => candidate.email !== email);
  return { user: publicUser(account), sessionToken: addSession(state, id) };
}

function addSession(state: AuthPersistenceState, userId: string): string {
  const token = randomBytes(32).toString("base64url");
  state.sessions.push({ tokenHash: hashToken(token), userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() });
  return token;
}

function publicUser(account: PersistedAuthAccount): AuthUser {
  return { id: account.id, username: account.username, email: account.email };
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
