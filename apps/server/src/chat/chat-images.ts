import type { SupportedImageMimeType } from "../images/image-input.js";
import type { ApplicationDatabase } from "../persistence/application-database.js";

export const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const CHAT_IMAGE_CACHE_MAX_BYTES = 64 * 1024 * 1024;

export type ChatImageMimeType = SupportedImageMimeType;

const extensions: Record<ChatImageMimeType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

export class ChatImageStore {
  private readonly cache = new Map<string, Buffer>();
  private readonly pendingReads = new Map<string, Promise<Buffer | undefined>>();
  private cachedBytes = 0;

  constructor(
    private readonly database: ApplicationDatabase,
    private readonly maxCacheBytes = CHAT_IMAGE_CACHE_MAX_BYTES,
  ) {}

  async save(id: string, source: Buffer): Promise<void> {
    await this.database.saveChatImage(id, source);
    this.cacheImage(id, Buffer.from(source));
  }

  async read(id: string): Promise<Buffer | undefined> {
    const cached = this.cache.get(id);
    if (cached) {
      this.cache.delete(id);
      this.cache.set(id, cached);
      return cached;
    }
    const pending = this.pendingReads.get(id);
    if (pending) return pending;

    const read = this.database.readChatImage(id).then((source) => {
      if (source && this.pendingReads.get(id) === read) this.cacheImage(id, source);
      return source;
    }).finally(() => {
      if (this.pendingReads.get(id) === read) this.pendingReads.delete(id);
    });
    this.pendingReads.set(id, read);
    return read;
  }

  async remove(id: string): Promise<void> {
    await this.database.removeChatImage(id);
    this.evict(id);
    this.pendingReads.delete(id);
  }

  private cacheImage(id: string, source: Buffer): void {
    this.evict(id);
    if (source.length > this.maxCacheBytes) return;
    for (const cachedId of this.cache.keys()) {
      if (this.cachedBytes + source.length <= this.maxCacheBytes) break;
      this.evict(cachedId);
    }
    this.cache.set(id, source);
    this.cachedBytes += source.length;
  }

  private evict(id: string): void {
    const cached = this.cache.get(id);
    if (!cached) return;
    this.cachedBytes -= cached.length;
    this.cache.delete(id);
  }
}

export function normalizeChatImageName(source: string | undefined, mimeType: ChatImageMimeType): string {
  const sourceName = source?.split(/[\\/]/).at(-1);
  const name = sourceName
    ? [...sourceName]
      .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
      .join("")
      .trim()
      .slice(0, 120)
    : undefined;
  return name || `image.${extensions[mimeType]}`;
}
