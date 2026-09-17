import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MemoryDatabase } from "../persistence/memory-database.js";
import { createTestApplication } from "../testing/application.js";

type Application = Awaited<ReturnType<typeof createTestApplication>>;
const applications = new Set<Application>();
let webp: Buffer;

beforeAll(async () => {
  webp = await sharp({ create: { width: 2, height: 2, channels: 4, background: "#123456" } }).webp().toBuffer();
});

afterEach(async () => {
  await Promise.all([...applications].map(({ app }) => app.close()));
  applications.clear();
  vi.restoreAllMocks();
});

async function application(database = new MemoryDatabase()): Promise<Application> {
  const context = await createTestApplication({ database, fixture: true });
  applications.add(context);
  return context;
}

async function login(context: Application, username = "maya"): Promise<string> {
  const authenticated = await context.auth.authenticate(username, "northstar");
  expect(authenticated).toBeDefined();
  return `whph_session=${authenticated!.sessionToken}`;
}

function upload(context: Application, cookie: string) {
  return context.app.inject({
    method: "POST",
    url: "/v1/conversations/conversation-leo/images",
    headers: { cookie, "content-type": "image/webp", "x-file-name": "diagram.webp" },
    payload: webp,
  });
}

describe("database-backed chat image API", () => {
  it("round-trips WebP uploads through the database across application restarts", async () => {
    const database = new MemoryDatabase();
    const context = await application(database);
    const cookie = await login(context);
    const uploaded = await upload(context, cookie);
    expect(uploaded.statusCode).toBe(201);
    const attachment = uploaded.json().attachments[0];
    expect(attachment).toMatchObject({ name: "diagram.webp", mimeType: "image/webp", size: webp.length });
    expect(await database.readChatImage(attachment.id)).toEqual(webp);

    const read = vi.spyOn(database, "readChatImage");
    const cached = await context.app.inject({ method: "GET", url: attachment.url, headers: { cookie } });
    expect(cached.statusCode).toBe(200);
    expect(cached.rawPayload).toEqual(webp);
    expect(cached.headers).toMatchObject({
      "content-type": "image/webp",
      "content-disposition": "inline; filename*=UTF-8''diagram.webp",
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=86400",
    });
    expect(read).not.toHaveBeenCalled();

    await context.app.close();
    applications.delete(context);
    const restarted = await application(database);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await restarted.app.inject({ method: "GET", url: attachment.url, headers: { cookie } });
      expect(response.statusCode).toBe(200);
      expect(response.rawPayload).toEqual(webp);
    }
    expect(read).toHaveBeenCalledExactlyOnceWith(attachment.id);
  });

  it("checks authentication and conversation access before reading cached images", async () => {
    const database = new MemoryDatabase();
    const context = await application(database);
    const cookie = await login(context);
    const outsiderCookie = await login(context, "jonas");
    const uploaded = await upload(context, cookie);
    expect(uploaded.statusCode).toBe(201);
    const imageUrl = uploaded.json().attachments[0].url;
    const read = vi.spyOn(database, "readChatImage");
    const save = vi.spyOn(database, "saveChatImage");

    expect((await context.app.inject({ method: "GET", url: imageUrl })).statusCode).toBe(401);
    expect((await context.app.inject({ method: "GET", url: imageUrl, headers: { cookie: outsiderCookie } })).statusCode).toBe(404);
    expect((await upload(context, "")).statusCode).toBe(401);
    expect((await upload(context, outsiderCookie)).statusCode).toBe(403);
    expect(read).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("does not create or publish a message when saving its image fails", async () => {
    const database = new MemoryDatabase();
    const context = await application(database);
    const cookie = await login(context);
    const messages = context.store.exportMutableState().messages;
    vi.spyOn(database, "saveChatImage").mockRejectedValueOnce(new Error("Database unavailable"));
    const publish = vi.spyOn(context.runtime, "publishChatMessage");

    const response = await upload(context, cookie);
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ code: "REQUEST_FAILED" });
    expect(context.store.exportMutableState().messages).toEqual(messages);
    expect(publish).not.toHaveBeenCalled();
  });

  it("removes the stored image if adding its message fails", async () => {
    const database = new MemoryDatabase();
    const context = await application(database);
    const cookie = await login(context);
    const save = vi.spyOn(database, "saveChatImage");
    const remove = vi.spyOn(database, "removeChatImage");
    vi.spyOn(context.store, "addMessage").mockImplementationOnce(() => { throw new Error("CONVERSATION_FORBIDDEN"); });

    expect((await upload(context, cookie)).statusCode).toBe(500);
    const imageId = save.mock.calls[0]![0];
    expect(remove).toHaveBeenCalledExactlyOnceWith(imageId);
    expect(await database.readChatImage(imageId)).toBeUndefined();
  });

  it("distinguishes missing image data from database failures and retries failed reads", async () => {
    const database = new MemoryDatabase();
    const context = await application(database);
    const cookie = await login(context);
    const uploaded = await upload(context, cookie);
    expect(uploaded.statusCode).toBe(201);
    const attachment = uploaded.json().attachments[0];
    await context.app.close();
    applications.delete(context);
    const restarted = await application(database);
    await database.removeChatImage(attachment.id);

    const missing = await restarted.app.inject({ method: "GET", url: attachment.url, headers: { cookie } });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: "IMAGE_NOT_FOUND" });

    vi.spyOn(database, "readChatImage").mockRejectedValueOnce(new Error("Database unavailable"));
    const unavailable = await restarted.app.inject({ method: "GET", url: attachment.url, headers: { cookie } });
    expect(unavailable.statusCode).toBe(500);
    expect(unavailable.json()).toMatchObject({ code: "REQUEST_FAILED" });

    await database.saveChatImage(attachment.id, webp);
    const recovered = await restarted.app.inject({ method: "GET", url: attachment.url, headers: { cookie } });
    expect(recovered.statusCode).toBe(200);
    expect(recovered.rawPayload).toEqual(webp);
  });
});
