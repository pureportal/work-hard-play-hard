import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SupportedImageMimeType } from "../images/image-input.js";

export const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export type ChatImageMimeType = SupportedImageMimeType;

const extensions: Record<ChatImageMimeType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

export class ChatImageStore {
  constructor(private readonly directory: string) {}

  async save(id: string, mimeType: ChatImageMimeType, source: Buffer): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.filePath(id, mimeType), source, { flag: "wx" });
  }

  read(id: string, mimeType: ChatImageMimeType): Promise<Buffer> {
    return readFile(this.filePath(id, mimeType));
  }

  async remove(id: string, mimeType: ChatImageMimeType): Promise<void> {
    await unlink(this.filePath(id, mimeType)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") {
        throw error;
      }
    });
  }

  private filePath(id: string, mimeType: ChatImageMimeType): string {
    return join(this.directory, `${id}.${extensions[mimeType]}`);
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
