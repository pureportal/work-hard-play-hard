import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { CheckpointStore } from "./persistence/checkpoint-store.js";
import { DemoStore } from "./store.js";
import { WorldRuntime } from "./world/world-runtime.js";

if (process.env.NODE_ENV === "production") {
  throw new Error("DEVELOPMENT_SEED_DISABLED");
}

const checkpointPath = fileURLToPath(new URL("../../../.data/checkpoint.json", import.meta.url));
const authPath = fileURLToPath(new URL("../../../.data/auth.json", import.meta.url));
const chatImagePath = fileURLToPath(new URL("../../../.data/chat-images", import.meta.url));
const store = new DemoStore();
const runtime = new WorldRuntime(store);
const data = store.getBootstrap("user-maya");
const onlinePlayers = data.members.filter((member) => member.online).length;

await rm(authPath, { force: true });
await rm(chatImagePath, { force: true, recursive: true });
await new CheckpointStore(checkpointPath).save({
  schemaVersion: 5,
  savedAt: new Date().toISOString(),
  players: runtime.serializePlayers(),
  store: store.exportMutableState(),
});

process.stdout.write(
  `Seeded ${data.members.length} player accounts (${onlinePlayers} online), ${data.messages.length} messages, ${data.meetings.length} meetings, and ${data.scores.length} scores.\nStart or restart the development server to load the reset.\n`,
);
