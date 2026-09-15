import { createHash } from "node:crypto";
import sharp, { type OutputInfo } from "sharp";
import { WHITEBOARD_IMAGE_MAX_BYTES, canUseWorkObject, getAssetDefinition } from "@workhard/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { AuthRateLimiter } from "../auth/rate-limiter.js";
import { detectImageMimeType } from "../images/image-input.js";
import type { WorkspaceStore } from "../store.js";
import type { WorldRuntime } from "../world/world-runtime.js";
import type { ApplicationDatabase } from "../persistence/application-database.js";

interface Options {
  database: ApplicationDatabase;
  store: WorkspaceStore;
  runtime: WorldRuntime;
  authenticate: (request: FastifyRequest) => string | undefined;
}

export function registerWhiteboardImageRoutes(app: FastifyInstance, { database, store, runtime, authenticate }: Options) {
  const limiter = new AuthRateLimiter();
  app.post<{ Params: { objectId: string } }>("/v1/whiteboards/:objectId/images", async (request, reply) => {
    const userId = authenticate(request);
    if (!userId) return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in to upload an image." });
    const object = store.getObject(request.params.objectId);
    const layout = object && store.getLayout(object.floorId);
    const player = runtime.serializePlayers().find((candidate) => candidate.userId === userId);
    if (!object || !layout || getAssetDefinition(object.assetId)?.workKind !== "whiteboard") {
      return reply.code(404).send({ code: "WORK_OBJECT_NOT_FOUND", message: "This board was removed." });
    }
    if (!player || !canUseWorkObject(object, layout, player)) {
      return reply.code(403).send({ code: "WORK_OBJECT_TOO_FAR", message: "Move closer to the board to upload an image." });
    }
    const retryAfter = limiter.consume("whiteboard-image", userId, 30, 15 * 60 * 1000);
    if (retryAfter) return reply.code(429).header("retry-after", String(retryAfter)).send({ code: "UPLOAD_LIMIT", message: "Too many uploads. Try again later." });
    const source = request.body;
    if (!Buffer.isBuffer(source) || !source.length || source.length > WHITEBOARD_IMAGE_MAX_BYTES) {
      return reply.code(400).send({ code: "IMAGE_INVALID", message: "Choose an image up to 5 MB." });
    }
    const mime = detectImageMimeType(source);
    if (!mime || mime !== request.headers["content-type"]?.split(";", 1)[0]) {
      return reply.code(415).send({ code: "IMAGE_TYPE_INVALID", message: "Choose a PNG, JPEG, GIF, or WebP image." });
    }
    let processed: { data: Buffer; info: OutputInfo };
    try {
      processed = await sharp(source, { animated: false, failOn: "warning", limitInputPixels: 25_000_000 })
        .rotate().resize(1600, 1200, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 88 }).toBuffer({ resolveWithObject: true });
    } catch {
      return reply.code(422).send({ code: "IMAGE_INVALID", message: "This image could not be read. Choose another image." });
    }
    if (!store.getObject(object.id)) return reply.code(404).send({ code: "WORK_OBJECT_NOT_FOUND", message: "This board was removed." });
    const { data, info } = processed;
    const id = createHash("sha256").update(data).digest("hex");
    await database.saveWhiteboardImage({ id, image: data, width: info.width, height: info.height, objectId: object.id });
    return reply.code(201).send({ url: `/v1/whiteboards/images/${id}` });
  });

  app.get<{ Params: { imageId: string } }>("/v1/whiteboards/images/:imageId", async (request, reply) => {
    if (!authenticate(request)) return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in to view this image." });
    const { imageId } = request.params;
    if (!/^[a-f0-9]{64}$/.test(imageId)) return reply.code(404).send({ code: "IMAGE_NOT_FOUND", message: "Image not found." });
    const data = await database.readWhiteboardImage(imageId);
    if (!data) return reply.code(404).send({ code: "IMAGE_NOT_FOUND", message: "Image not found." });
    return reply.header("content-type", "image/webp").header("x-content-type-options", "nosniff")
      .header("cache-control", "private, max-age=3600").send(data);
  });
}
