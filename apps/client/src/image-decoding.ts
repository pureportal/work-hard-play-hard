const waiting: Array<() => void> = [];
let decoding = false;

export async function decodeImage(image: HTMLImageElement): Promise<void> {
  if (decoding) await new Promise<void>(resolve => waiting.push(resolve));
  else decoding = true;
  try {
    await image.decode();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else decoding = false;
  }
}
