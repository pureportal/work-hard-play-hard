import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { WorldPlayer } from "@workhard/shared";
import type { MutableStoreState } from "../store.js";

export interface CheckpointData {
  schemaVersion: 5;
  savedAt: string;
  players: WorldPlayer[];
  store: MutableStoreState;
}

export class CheckpointStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<CheckpointData | undefined> {
    let source: string;
    try {
      source = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
    const data = JSON.parse(source) as Partial<CheckpointData>;
    if (data.schemaVersion !== 5 || !Array.isArray(data.players) || !data.store) {
      throw new Error("CHECKPOINT_INVALID");
    }
    return data as CheckpointData;
  }

  async save(data: CheckpointData): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(data), "utf8");
    await rename(temporaryPath, this.filePath);
  }
}
