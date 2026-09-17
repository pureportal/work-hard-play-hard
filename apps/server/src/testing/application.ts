import { createApplication } from "../app.js";
import { MemoryDatabase } from "../persistence/memory-database.js";
import { WorkspaceStore } from "../store.js";
import { WorldRuntime } from "../world/world-runtime.js";
import { createTestData } from "./workspace-data.js";

export async function createTestApplication(
  { fixture = false, database = new MemoryDatabase(), ...options }: Omit<NonNullable<Parameters<typeof createApplication>[0]>, "database"> & { database?: MemoryDatabase; fixture?: boolean } = {},
) {
  if (fixture && !await database.loadWorkspaceState()) await populateTestWorkspace(database);
  return createApplication({ exposeMagicLinks: true, exposeInvitationLinks: true, exposePasswordResetLinks: true, exposeRegistrationLinks: true, ...options, database });
}

export async function populateTestWorkspace(database: MemoryDatabase): Promise<void> {
  if (!(database instanceof MemoryDatabase)) throw new Error("TEST_DATABASE_REQUIRED");
  const store = new WorkspaceStore(createTestData());
  const runtime = new WorldRuntime(store);
  try {
    await database.saveWorkspaceState({ players: runtime.serializePlayers(), store: store.exportMutableState() });
    await database.saveAuthState({
      accounts: store.getMembers().map((member) => ({
        id: member.id,
        username: member.email.split("@")[0]!,
        email: member.email,
        passwordHash: "scrypt$16384$8$1$5aeMW3V8WpCSX2hvin-ijA$0oZf_HWwOW2eBmseAoGRHpyDXwxHjEKVhYDe2Ondm4F76hYYVlouqi92L20Sqjtcu5VjW7OIz0K95FwqnDFoWQ",
        createdAt: new Date().toISOString(),
      })),
      sessions: [],
      magicLinks: [],
      passwordResets: [],
      registrationLinks: [],
    });
  } finally {
    runtime.stop();
  }
}
