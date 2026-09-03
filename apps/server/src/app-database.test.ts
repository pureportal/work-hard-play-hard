import { afterEach, describe, expect, it, vi } from "vitest";
import { createApplication } from "./app.js";
import type { WorkspacePersistenceState } from "./persistence/application-database.js";
import { MemoryDatabase } from "./persistence/memory-database.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("application database persistence", () => {
  it("reports database connectivity through readiness", async () => {
    const database = new MemoryDatabase();
    const context = await createApplication({ database });

    const ready = await context.app.inject("/v1/health/ready");
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: "ready", database: true });

    vi.spyOn(database, "isHealthy").mockResolvedValue(false);
    const unavailable = await context.app.inject("/v1/health/ready");

    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toEqual({ status: "unavailable", database: false });
    await context.app.close();
  });

  it("waits for an active write and persists changes made during that write", async () => {
    vi.useFakeTimers();
    const database = new MemoryDatabase();
    const context = await createApplication({ database, seeded: true });
    await context.app.ready();
    context.runtime.stop();

    const states: WorkspacePersistenceState[] = [];
    let finishFirstWrite: (() => void) | undefined;
    const save = vi.spyOn(database, "saveWorkspaceState").mockImplementation(async (state) => {
      states.push(structuredClone(state));
      if (states.length === 1) {
        await new Promise<void>((resolve) => {
          finishFirstWrite = resolve;
        });
      }
    });
    context.store.updateAvailability("user-maya", "busy");

    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).toHaveBeenCalledTimes(1);

    context.store.updateAvailability("user-maya", "away");
    const closing = context.app.close();
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);

    finishFirstWrite?.();
    await closing;

    expect(save).toHaveBeenCalledTimes(2);
    expect(states[1]?.store.members.find((member) => member.id === "user-maya")?.availability).toBe("away");
  });
});
