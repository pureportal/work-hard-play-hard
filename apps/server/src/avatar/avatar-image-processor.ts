import { Worker } from "node:worker_threads";

export const AVATAR_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export interface ProcessedAvatarImage {
  data: Buffer;
  mimeType: "image/webp";
  width: number;
  height: number;
}

interface AvatarImageJob {
  id: number;
  source: ArrayBuffer;
  resolve: (image: ProcessedAvatarImage) => void;
  reject: (error: Error) => void;
  timeout?: NodeJS.Timeout;
}

interface AvatarWorkerSuccess {
  id: number;
  data: ArrayBuffer;
  width: number;
  height: number;
}

interface AvatarWorkerFailure {
  id: number;
  error: "AVATAR_IMAGE_INVALID";
}

export class AvatarImageInputError extends Error {
  constructor() {
    super("AVATAR_IMAGE_INVALID");
    this.name = "AvatarImageInputError";
  }
}

export class AvatarImageProcessor {
  private readonly queue: AvatarImageJob[] = [];
  private activeJob?: AvatarImageJob;
  private worker?: Worker;
  private nextId = 1;
  private closed = false;

  process(source: Buffer): Promise<ProcessedAvatarImage> {
    if (this.closed) {
      return Promise.reject(new Error("AVATAR_PROCESSOR_CLOSED"));
    }
    const bytes = Uint8Array.from(source);
    return new Promise((resolve, reject) => {
      this.queue.push({
        id: this.nextId++,
        source: bytes.buffer,
        resolve,
        reject,
      });
      this.dispatch();
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    const error = new Error("AVATAR_PROCESSOR_CLOSED");
    this.activeJob?.reject(error);
    if (this.activeJob?.timeout) {
      clearTimeout(this.activeJob.timeout);
    }
    delete this.activeJob;
    for (const job of this.queue.splice(0)) {
      job.reject(error);
    }
    const worker = this.worker;
    delete this.worker;
    if (worker) {
      await worker.terminate();
    }
  }

  private dispatch(): void {
    if (this.closed || this.activeJob) {
      return;
    }
    const job = this.queue.shift();
    if (!job) {
      return;
    }
    const worker = this.worker ?? this.createWorker();
    this.activeJob = job;
    job.timeout = setTimeout(() => {
      if (this.activeJob !== job) {
        return;
      }
      job.reject(new Error("AVATAR_PROCESSING_TIMEOUT"));
      delete this.activeJob;
      if (this.worker === worker) {
        delete this.worker;
      }
      void worker.terminate().finally(() => this.dispatch());
    }, 30_000);
    try {
      worker.postMessage({ id: job.id, source: job.source }, [job.source]);
    } catch (error) {
      this.handleWorkerFailure(worker, error instanceof Error ? error : new Error("AVATAR_PROCESSING_FAILED"));
    }
  }

  private createWorker(): Worker {
    const extension = import.meta.url.endsWith(".ts") ? "ts" : "js";
    const worker = new Worker(new URL(`./avatar-image-worker.${extension}`, import.meta.url), {
      name: "avatar-image-processor",
    });
    worker.on("message", (message: unknown) => this.handleMessage(worker, message));
    worker.on("error", (error) => this.handleWorkerFailure(worker, error));
    worker.on("exit", (code) => {
      if (!this.closed) {
        this.handleWorkerFailure(worker, new Error(`AVATAR_WORKER_EXIT_${code}`));
      }
    });
    this.worker = worker;
    return worker;
  }

  private handleMessage(worker: Worker, message: unknown): void {
    const job = this.activeJob;
    if (this.worker !== worker || !job || !isWorkerResponse(message) || message.id !== job.id) {
      return;
    }
    if (job.timeout) {
      clearTimeout(job.timeout);
    }
    delete this.activeJob;
    if ("error" in message) {
      job.reject(new AvatarImageInputError());
    } else {
      job.resolve({
        data: Buffer.from(message.data),
        mimeType: "image/webp",
        width: message.width,
        height: message.height,
      });
    }
    this.dispatch();
  }

  private handleWorkerFailure(worker: Worker, error: Error): void {
    if (this.worker !== worker) {
      return;
    }
    delete this.worker;
    const job = this.activeJob;
    delete this.activeJob;
    if (job?.timeout) {
      clearTimeout(job.timeout);
    }
    job?.reject(error);
    void worker.terminate().finally(() => this.dispatch());
  }
}

function isWorkerResponse(message: unknown): message is AvatarWorkerSuccess | AvatarWorkerFailure {
  if (typeof message !== "object" || message === null || !("id" in message) || typeof message.id !== "number") {
    return false;
  }
  if ("error" in message) {
    return message.error === "AVATAR_IMAGE_INVALID";
  }
  return "data" in message
    && message.data instanceof ArrayBuffer
    && "width" in message
    && typeof message.width === "number"
    && "height" in message
    && typeof message.height === "number";
}
