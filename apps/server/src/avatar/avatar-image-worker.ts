import { parentPort } from "node:worker_threads";
import sharp from "sharp";

interface AvatarWorkerRequest {
  id: number;
  source: ArrayBuffer;
}

const port = parentPort;
if (!port) {
  throw new Error("AVATAR_WORKER_PORT_MISSING");
}

port.on("message", async (message: AvatarWorkerRequest) => {
  try {
    const { data, info } = await sharp(Buffer.from(message.source), {
      animated: false,
      failOn: "warning",
      limitInputPixels: 25_000_000,
    })
      .rotate()
      .resize(256, 256, { fit: "cover", position: "attention" })
      .webp({ effort: 4, quality: 82, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });
    const output = Uint8Array.from(data);
    port.postMessage({
      id: message.id,
      data: output.buffer,
      width: info.width,
      height: info.height,
    }, [output.buffer]);
  } catch {
    port.postMessage({ id: message.id, error: "AVATAR_IMAGE_INVALID" });
  }
});
