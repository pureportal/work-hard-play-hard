import { expect, it, vi } from "vitest";
import { decodeImage } from "./image-decoding";

it("limits concurrent decoding across images and continues after a rejected image", async () => {
  let rejectFirst!: (reason: Error) => void;
  const first = document.createElement("img");
  first.decode = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectFirst = reject; }));
  const second = document.createElement("img");
  second.decode = vi.fn().mockResolvedValue(undefined);
  const third = document.createElement("img");
  third.decode = vi.fn().mockResolvedValue(undefined);
  const failed = decodeImage(first);
  const rejection = expect(failed).rejects.toThrow("Invalid image");
  const queued = decodeImage(second);
  const last = decodeImage(third);
  expect(first.decode).toHaveBeenCalledOnce();
  expect(second.decode).not.toHaveBeenCalled();
  expect(third.decode).not.toHaveBeenCalled();
  rejectFirst(new Error("Invalid image"));
  await Promise.all([rejection, queued, last]);
  expect(second.decode).toHaveBeenCalledOnce();
  expect(third.decode).toHaveBeenCalledOnce();
  expect(vi.mocked(second.decode).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(third.decode).mock.invocationCallOrder[0]!);
});
