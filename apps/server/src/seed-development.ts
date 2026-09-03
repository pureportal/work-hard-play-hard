import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { AuthStore } from "./auth/auth-store.js";
import { PostgreSqlDatabase } from "./persistence/postgresql-database.js";
import { DemoStore } from "./store.js";
import { WorldRuntime } from "./world/world-runtime.js";

if (process.env.NODE_ENV === "production") {
  throw new Error("DEVELOPMENT_SEED_DISABLED");
}

const chatImagePath = fileURLToPath(new URL("../../../.data/chat-images", import.meta.url));
const database = await PostgreSqlDatabase.connect();

try {
  const store = new DemoStore();
  const runtime = new WorldRuntime(store);
  const data = store.getBootstrap("user-maya");
  const onlinePlayers = data.members.filter((member) => member.online).length;
  const rooms = data.layouts.flatMap((layout) => layout.rooms).length;
  const objects = data.layouts.flatMap((layout) => layout.objects).length;

  await database.clear();
  await rm(chatImagePath, { force: true, recursive: true });
  await database.saveWorkspaceState({
    players: runtime.serializePlayers(),
    store: store.exportMutableState(),
  });
  const auth = await AuthStore.create({ database, members: store.getMembers() });
  await auth.close();

  process.stdout.write(
    `Seeded ${data.floors.length} floors with ${rooms} rooms and ${objects} objects, ${data.members.length} player accounts (${onlinePlayers} online), ${data.messages.length} messages, ${data.meetings.length} meetings, and ${data.scores.length} scores.\nStart or restart the development server to load the reset.\n`,
  );
} finally {
  await database.close();
}
