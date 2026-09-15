import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { createTestApplication } from "../testing/application.js";
import { MemoryDatabase } from "../persistence/memory-database.js";

const applications: Awaited<ReturnType<typeof createTestApplication>>[] = [];
afterEach(async () => {
  await Promise.all(applications.splice(0).map(({ app }) => app.close()));
});

async function fixture() {
  const context = await createTestApplication({ database: new MemoryDatabase(), fixture: true });
  applications.push(context);
  const login = await context.app.inject({ method: "POST", url: "/v1/auth/login", payload: { identifier: "maya", password: "northstar" } });
  expect(login.statusCode).toBe(200);
  const cookie = login.cookies.map((value) => `${value.name}=${value.value}`).join("; ");
  const board = context.store.getObject("object-daily-board")!;
  const layout = context.store.getLayout(board.floorId)!;
  context.store.replaceLayout({ ...layout, revision: layout.revision + 1, rooms: [], walls: [], openings: [], objects: [board] });
  context.runtime.connect("user-maya", board.floorId, () => {});
  context.runtime.restorePlayers(context.runtime.serializePlayers().map((player) => player.userId === "user-maya" ? { ...player, floorId: board.floorId, x: board.x + 48, y: board.y + 40 } : player));
  const image = await sharp({ create: { width: 800, height: 400, channels: 3, background: "#a18bd1" } }).png().toBuffer();
  return { ...context, cookie, image, url: `/v1/whiteboards/${board.id}/images` };
}

describe("whiteboard images", () => {
  it("stores images, preserves proportions, deduplicates data, and requires authentication to read", async () => {
    const { app, cookie, image, url } = await fixture();
    const uploaded = await app.inject({ method: "POST", url, headers: { cookie, "content-type": "image/png" }, payload: image });
    expect(uploaded.statusCode).toBe(201);
    const source = uploaded.json<{ url: string }>().url;
    expect(source).toMatch(/^\/v1\/whiteboards\/images\/[a-f0-9]{64}$/);
    const again = await app.inject({ method: "POST", url, headers: { cookie, "content-type": "image/png" }, payload: image });
    expect(again.json()).toEqual(uploaded.json());
    expect((await app.inject(source)).statusCode).toBe(401);
    const fetched = await app.inject({ url: source, headers: { cookie } });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.headers["content-type"]).toBe("image/webp");
    expect(await sharp(fetched.rawPayload).metadata()).toMatchObject({ width: 800, height: 400 });
    expect((await app.inject({ url: "/v1/whiteboards/images/invalid", headers: { cookie } })).statusCode).toBe(404);
  });

  it("rejects unauthenticated, distant, corrupt, and incorrectly declared uploads", async () => {
    const { app, runtime, cookie, image, url } = await fixture();
    expect((await app.inject({ method: "POST", url, headers: { "content-type": "image/png" }, payload: image })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url, headers: { cookie, "content-type": "image/jpeg" }, payload: image })).statusCode).toBe(415);
    expect((await app.inject({ method: "POST", url, headers: { cookie, "content-type": "image/png" }, payload: image.subarray(0, 16) })).statusCode).toBe(422);
    runtime.restorePlayers(runtime.serializePlayers().map((player) => ({ ...player, x: 20, y: 20 })));
    expect((await app.inject({ method: "POST", url, headers: { cookie, "content-type": "image/png" }, payload: image })).statusCode).toBe(403);
  });
});
