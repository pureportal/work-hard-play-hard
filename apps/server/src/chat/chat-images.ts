import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChatAttachment } from "@workhard/shared";

export const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export type ChatImageMimeType = ChatAttachment["mimeType"];

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

export function detectChatImageMimeType(source: Buffer): ChatImageMimeType | undefined {
  if (source.length >= 8 && source.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "image/png";
  }
  if (source.length >= 3 && source[0] === 0xff && source[1] === 0xd8 && source[2] === 0xff) {
    return "image/jpeg";
  }
  if (source.length >= 6 && ["GIF87a", "GIF89a"].includes(source.subarray(0, 6).toString("ascii"))) {
    return "image/gif";
  }
  if (source.length >= 12 && source.subarray(0, 4).toString("ascii") === "RIFF" && source.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return undefined;
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
