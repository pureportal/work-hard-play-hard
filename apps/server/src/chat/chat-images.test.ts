import { describe, expect, it, vi } from "vitest";
import { MemoryDatabase } from "../persistence/memory-database.js";
import { ChatImageStore } from "./chat-images.js";

describe("chat image storage", () => {
  it("persists images before caching them and loads them into a new cache", async () => {
    const database = new MemoryDatabase();
    const read = vi.spyOn(database, "readChatImage");
    const source = Buffer.from([0, 255, 127, 128]);
    const store = new ChatImageStore(database);

    await store.save("image", source);
    source.fill(0);
    expect(await store.read("image")).toEqual(Buffer.from([0, 255, 127, 128]));
    expect(read).not.toHaveBeenCalled();

    const restarted = new ChatImageStore(database);
    expect(await restarted.read("image")).toEqual(Buffer.from([0, 255, 127, 128]));
    expect(await restarted.read("image")).toEqual(Buffer.from([0, 255, 127, 128]));
    expect(read).toHaveBeenCalledExactlyOnceWith("image");
  });

  it("evicts the least recently read images to stay within its byte budget", async () => {
    const database = new MemoryDatabase();
    const read = vi.spyOn(database, "readChatImage");
    const store = new ChatImageStore(database, 6);
    await store.save("first", Buffer.alloc(2, 1));
    await store.save("second", Buffer.alloc(3, 2));
    await store.read("first");
    await store.save("third", Buffer.alloc(3, 3));

    expect(await store.read("first")).toEqual(Buffer.alloc(2, 1));
    expect(read).not.toHaveBeenCalled();
    expect(await store.read("second")).toEqual(Buffer.alloc(3, 2));
    expect(read).toHaveBeenCalledExactlyOnceWith("second");

    await store.save("large", Buffer.alloc(6, 4));
    read.mockClear();
    expect(await store.read("first")).toEqual(Buffer.alloc(2, 1));
    expect(await store.read("second")).toEqual(Buffer.alloc(3, 2));
    expect(read.mock.calls).toEqual([["first"], ["second"]]);
  });

  it.each([0, 3])("reads images larger than the %i-byte cache directly from the database", async (budget) => {
    const database = new MemoryDatabase();
    const read = vi.spyOn(database, "readChatImage");
    const store = new ChatImageStore(database, budget);
    const source = Buffer.alloc(4, 255);
    await store.save("image", source);

    expect(await store.read("image")).toEqual(source);
    expect(await store.read("image")).toEqual(source);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("shares concurrent database reads and caches the result", async () => {
    const database = new MemoryDatabase();
    let completeRead!: (source: Buffer | undefined) => void;
    const pending = new Promise<Buffer | undefined>((resolve) => { completeRead = resolve; });
    const read = vi.spyOn(database, "readChatImage").mockReturnValue(pending);
    const store = new ChatImageStore(database);
    const first = store.read("image");
    const second = store.read("image");
    const source = Buffer.from([255, 0]);
    completeRead(source);

    expect(await Promise.all([first, second])).toEqual([source, source]);
    expect(await store.read("image")).toEqual(source);
    expect(read).toHaveBeenCalledOnce();
  });

  it("retries missing images and database failures without caching them", async () => {
    const database = new MemoryDatabase();
    const read = vi.spyOn(database, "readChatImage").mockRejectedValueOnce(new Error("Database unavailable"));
    const store = new ChatImageStore(database);

    await expect(store.read("image")).rejects.toThrow("Database unavailable");
    expect(await store.read("image")).toBeUndefined();
    await database.saveChatImage("image", Buffer.from([255]));
    expect(await store.read("image")).toEqual(Buffer.from([255]));
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("does not cache unsuccessful writes or overwrite an existing image", async () => {
    const database = new MemoryDatabase();
    const save = vi.spyOn(database, "saveChatImage").mockRejectedValueOnce(new Error("Database unavailable"));
    const store = new ChatImageStore(database);
    await expect(store.save("image", Buffer.from([1]))).rejects.toThrow("Database unavailable");
    expect(await store.read("image")).toBeUndefined();

    await store.save("image", Buffer.from([2]));
    await expect(store.save("image", Buffer.from([3]))).rejects.toThrow("CHAT_IMAGE_EXISTS");
    expect(await store.read("image")).toEqual(Buffer.from([2]));
    expect(await database.readChatImage("image")).toEqual(Buffer.from([2]));
    expect(save).toHaveBeenCalledTimes(3);
  });

  it("removes images from persistence and the cache", async () => {
    const database = new MemoryDatabase();
    const store = new ChatImageStore(database);
    await store.save("image", Buffer.from([255]));
    await store.remove("image");

    expect(await store.read("image")).toBeUndefined();
    expect(await database.readChatImage("image")).toBeUndefined();
    await expect(store.remove("image")).resolves.toBeUndefined();
  });

  it("does not cache an in-flight read after removal", async () => {
    const database = new MemoryDatabase();
    let completeRead!: (source: Buffer | undefined) => void;
    const pending = new Promise<Buffer | undefined>((resolve) => { completeRead = resolve; });
    vi.spyOn(database, "readChatImage").mockReturnValueOnce(pending);
    const store = new ChatImageStore(database);
    const read = store.read("image");
    await store.remove("image");
    completeRead(Buffer.from([255]));
    await read;

    expect(await store.read("image")).toBeUndefined();
  });
});
