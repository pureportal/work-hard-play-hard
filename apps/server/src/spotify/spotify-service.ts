import { isSpotifyJamUrl, type SpotifyActivity, type SpotifyEvent, type SpotifyStatus } from "@workhard/shared";
import type { ApplicationDatabase } from "../persistence/application-database.js";
import { SpotifyAuthorization } from "./spotify-authorization.js";
import { SpotifyClient, SpotifyError, spotifyTokensSchema, type SpotifyTokens } from "./spotify-client.js";
import type { SpotifyConfig } from "./spotify-config.js";
import { decryptTokens, encryptTokens } from "../security/encrypted-tokens.js";
import type { SpotifyConnectionRecord } from "./spotify-record.js";

interface Connection {
  record: SpotifyConnectionRecord;
  sharing: boolean;
  revision: number;
  nextPollAt: number;
  polling: boolean;
  error: string | null;
  jam: { url: string; expiresAt: number } | null;
}

interface SpotifyServiceOptions {
  database: ApplicationDatabase;
  config: SpotifyConfig | undefined;
  publish: (event: SpotifyEvent) => void;
  reportError: (error: unknown) => void;
  fetcher?: typeof fetch;
}

export class SpotifyService {
  readonly authorization = new SpotifyAuthorization();
  private readonly connections = new Map<string, Connection>();
  private readonly activities = new Map<string, SpotifyActivity>();
  private readonly online = new Set<string>();
  private readonly revisions = new Map<string, number>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly client: SpotifyClient | undefined;
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;
  private pollingCount = 0;

  private constructor(private readonly options: SpotifyServiceOptions) {
    this.client = options.config ? new SpotifyClient(options.config, options.fetcher) : undefined;
  }

  static async create(options: SpotifyServiceOptions): Promise<SpotifyService> {
    const service = new SpotifyService(options);
    for (const record of await options.database.loadSpotifyConnections()) {
      service.connections.set(record.userId, service.connection(record));
    }
    return service;
  }

  start(): void {
    this.timer = setInterval(() => this.tick(), 1_000);
    this.timer.unref();
  }

  async close(): Promise<void> {
    this.stopped = true;
    clearInterval(this.timer);
    await Promise.allSettled(this.queues.values());
  }

  status(userId: string): SpotifyStatus {
    const connection = this.connections.get(userId);
    return {
      configured: Boolean(this.client), connected: Boolean(connection?.record.encryptedTokens),
      sharing: connection?.sharing ?? false,
      needsReconnect: Boolean(connection && !connection.record.encryptedTokens),
      error: connection?.error ?? null, jamUrl: connection?.jam?.url ?? null,
    };
  }

  snapshot(): SpotifyActivity[] {
    return [...this.activities.values()].filter((activity) => activity.expiresAt > Date.now());
  }

  setOnline(userId: string, online: boolean): void {
    if (online) {
      this.online.add(userId);
      const connection = this.connections.get(userId);
      if (connection) connection.nextPollAt = 0;
    } else {
      this.online.delete(userId);
      this.revisions.set(userId, (this.revisions.get(userId) ?? 0) + 1);
      this.clearActivity(userId);
    }
  }

  beginConnection(userId: string, sessionToken: string): { url: string; state: string } {
    if (!this.options.config) throw new SpotifyError("SPOTIFY_NOT_CONFIGURED", "Spotify has not been set up for this workspace.", 503);
    this.revisions.set(userId, (this.revisions.get(userId) ?? 0) + 1);
    return this.authorization.begin(userId, sessionToken, this.options.config);
  }

  async completeConnection(userId: string, code: string, verifier: string, sessionIsActive: () => boolean): Promise<void> {
    const revision = this.revisions.get(userId);
    await this.enqueue(userId, async () => {
      if (!this.client || !this.options.config) throw new SpotifyError("SPOTIFY_NOT_CONFIGURED", "Spotify has not been set up for this workspace.", 503);
      const tokens = await this.client.exchange(code, verifier);
      if (this.revisions.get(userId) !== revision || this.stopped || !sessionIsActive()) throw new SpotifyError("SPOTIFY_CANCELLED", "Try connecting Spotify again.", 409);
      const record: SpotifyConnectionRecord = {
        userId, encryptedTokens: encryptTokens(JSON.stringify(tokens), userId, this.options.config.encryptionKey),
        sharing: false,
      };
      await this.options.database.saveSpotifyConnection(record);
      if (this.revisions.get(userId) === revision && !this.stopped) {
        this.clearActivity(userId);
        this.connections.set(userId, this.connection(record));
      }
    });
  }

  async disconnect(userId: string): Promise<SpotifyStatus> {
    this.authorization.cancel(userId);
    this.revisions.set(userId, (this.revisions.get(userId) ?? 0) + 1);
    this.clearActivity(userId);
    this.connections.delete(userId);
    await this.enqueue(userId, () => this.options.database.removeSpotifyConnection(userId));
    return this.status(userId);
  }

  async setSharing(userId: string, sharing: boolean): Promise<SpotifyStatus> {
    const connection = this.requireConnection(userId);
    const revision = ++connection.revision;
    if (!sharing) {
      connection.sharing = false;
      this.clearActivity(userId);
    }
    return this.enqueue(userId, async () => {
      if (this.connections.get(userId) !== connection || connection.revision !== revision) return this.status(userId);
      const record = { ...connection.record, sharing };
      await this.options.database.saveSpotifyConnection(record);
      connection.record = record;
      if (connection.revision === revision) connection.sharing = sharing;
      connection.nextPollAt = 0;
      return this.status(userId);
    });
  }

  setJam(userId: string, url: string | null): SpotifyStatus {
    const connection = this.requireConnection(userId);
    const activity = this.activities.get(userId);
    if (url && !isSpotifyJamUrl(url)) throw new SpotifyError("SPOTIFY_JAM_INVALID", "Paste a Spotify Jam invite link.", 400);
    if (url && (!activity || activity.expiresAt <= Date.now() || !connection.sharing)) {
      throw new SpotifyError("SPOTIFY_JAM_INVALID", "Play a song in Spotify and turn on sharing before adding a Jam invite.", 400);
    }
    connection.jam = url ? { url, expiresAt: Date.now() + 60 * 60_000 } : null;
    if (activity) this.publish({ ...activity, jamUrl: url });
    return this.status(userId);
  }

  async playSameSong(userId: string, targetUserId: string, trackId: string): Promise<void> {
    const connection = this.requireConnection(userId);
    await this.enqueue(userId, async () => {
      const activity = this.activities.get(targetUserId);
      if (!activity || activity.expiresAt <= Date.now() || activity.trackId !== trackId) {
        throw new SpotifyError("SPOTIFY_TRACK_CHANGED", "This song is no longer being shared. Check the player’s current song.", 409);
      }
      try {
        await this.withToken(connection, (token) => this.client!.play(token, activity.trackId));
        connection.nextPollAt = 0;
      } catch (error) {
        await this.handleError(connection, error);
        throw error;
      }
    });
  }

  tick(): void {
    if (this.stopped) return;
    const now = Date.now();
    for (const [userId, activity] of this.activities) {
      if (activity.expiresAt <= now) {
        this.activities.delete(userId);
        this.options.publish({ type: "spotify.activity", serverTime: now, userId, activity: null });
      }
    }
    for (const [userId, connection] of this.connections) {
      if (connection.jam && connection.jam.expiresAt <= now) {
        connection.jam = null;
        const activity = this.activities.get(userId);
        if (activity) this.publish({ ...activity, jamUrl: null });
      }
      if (!this.client || now < this.client.retryAt || this.pollingCount >= 4) continue;
      if (!connection.sharing || !connection.record.encryptedTokens || !this.online.has(userId)
        || connection.polling || connection.nextPollAt > now) continue;
      connection.polling = true;
      this.pollingCount++;
      void this.enqueue(userId, () => this.poll(connection)).catch(this.options.reportError).finally(() => {
        connection.polling = false;
        this.pollingCount--;
      });
    }
  }

  private async poll(connection: Connection): Promise<void> {
    const userId = connection.record.userId;
    const revision = this.revisions.get(userId);
    connection.nextPollAt = Date.now() + 15_000;
    if (!connection.sharing || !this.online.has(userId) || this.connections.get(userId) !== connection) return;
    try {
      const activity = await this.withToken(connection, (token) => this.client!.playback(token, userId));
      if (this.stopped || this.connections.get(userId) !== connection || !connection.sharing
        || !this.online.has(userId) || revision !== this.revisions.get(userId) || Date.now() < this.client!.retryAt) return;
      connection.error = null;
      connection.nextPollAt = Date.now() + (activity ? Math.max(5_000, Math.min(15_000, activity.expiresAt - Date.now())) : 20_000);
      if (activity) this.publish({ ...activity, jamUrl: connection.jam?.url ?? null });
      else this.clearActivity(userId);
    } catch (error) {
      await this.handleError(connection, error);
    }
  }

  private async withToken<T>(connection: Connection, operation: (token: string) => Promise<T>): Promise<T> {
    if (this.connections.get(connection.record.userId) !== connection || !connection.record.encryptedTokens) {
      throw new SpotifyError("SPOTIFY_RECONNECT", "Connect Spotify again to continue.", 409);
    }
    let tokens: SpotifyTokens;
    try {
      tokens = spotifyTokensSchema.parse(JSON.parse(decryptTokens(
        connection.record.encryptedTokens, connection.record.userId, this.options.config!.encryptionKey,
      )));
    } catch {
      throw new SpotifyError("SPOTIFY_RECONNECT", "Connect Spotify again to continue.", 409);
    }
    if (tokens.expiresAt <= Date.now() + 30_000) tokens = await this.refresh(connection, tokens);
    try {
      return await operation(tokens.accessToken);
    } catch (error) {
      if (!(error instanceof SpotifyError) || error.code !== "SPOTIFY_ACCESS_EXPIRED") throw error;
      tokens = await this.refresh(connection, tokens);
      return operation(tokens.accessToken);
    }
  }

  private async refresh(connection: Connection, tokens: SpotifyTokens): Promise<SpotifyTokens> {
    const next = await this.client!.refresh(tokens);
    const userId = connection.record.userId;
    if (this.connections.get(userId) !== connection || this.stopped) throw new SpotifyError("SPOTIFY_CANCELLED", "Spotify was disconnected.", 409);
    const record = {
      ...connection.record,
      encryptedTokens: encryptTokens(JSON.stringify(next), userId, this.options.config!.encryptionKey),
    };
    await this.options.database.saveSpotifyConnection(record);
    connection.record = record;
    return next;
  }

  private async handleError(connection: Connection, error: unknown): Promise<void> {
    const userId = connection.record.userId;
    if (this.connections.get(userId) !== connection) return;
    this.clearActivity(userId);
    connection.error = error instanceof SpotifyError ? error.message : "Spotify activity could not be updated. Try reconnecting.";
    connection.nextPollAt = Date.now() + 60_000;
    if (error instanceof SpotifyError && ["SPOTIFY_RECONNECT", "SPOTIFY_ACCESS_EXPIRED", "SPOTIFY_SCOPES"].includes(error.code)) {
      connection.sharing = false;
      connection.record = { userId, encryptedTokens: null, sharing: false };
      await this.options.database.saveSpotifyConnection(connection.record);
    } else if (error instanceof SpotifyError && error.code === "SPOTIFY_RATE_LIMITED") {
      for (const id of this.activities.keys()) this.clearActivity(id);
    } else if (!(error instanceof SpotifyError)) {
      this.options.reportError(error);
    }
  }

  private requireConnection(userId: string): Connection {
    const connection = this.connections.get(userId);
    if (!this.client || !connection?.record.encryptedTokens) throw new SpotifyError("SPOTIFY_RECONNECT", "Connect Spotify in Settings to play this song.", 409);
    return connection;
  }

  private connection(record: SpotifyConnectionRecord): Connection {
    return { record, sharing: record.sharing, revision: 0, nextPollAt: 0, polling: false, error: null, jam: null };
  }

  private publish(activity: SpotifyActivity): void {
    this.activities.set(activity.userId, activity);
    this.options.publish({ type: "spotify.activity", serverTime: Date.now(), userId: activity.userId, activity });
  }

  private clearActivity(userId: string): void {
    const connection = this.connections.get(userId);
    if (connection) connection.jam = null;
    if (this.activities.delete(userId)) this.options.publish({ type: "spotify.activity", serverTime: Date.now(), userId, activity: null });
  }

  private enqueue<T>(userId: string, operation: () => Promise<T>): Promise<T> {
    const result = (this.queues.get(userId) ?? Promise.resolve()).then(operation);
    const settled = result.then(() => undefined, () => undefined);
    this.queues.set(userId, settled);
    void settled.then(() => { if (this.queues.get(userId) === settled) this.queues.delete(userId); });
    return result;
  }
}
