import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { CHARACTER_CANVAS_SIZE } from "../../packages/shared/src/character.ts";

export const sharp = createRequire(new URL("../../apps/server/package.json", import.meta.url))("sharp");
const nativeSize = CHARACTER_CANVAS_SIZE;
const transparent = Object.freeze([0, 0, 0, 0]);

export function blank(width = nativeSize, height = nativeSize) {
  return { data: Buffer.alloc(width * height * 4), width, height };
}

export async function readImage(name) {
  const { data, info } = await sharp(fileURLToPath(new URL(`sources/${name}.png`, import.meta.url))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export function pixel(input, x, y) {
  if (x < 0 || y < 0 || x >= input.width || y >= input.height) return transparent;
  const offset = (Math.floor(y) * input.width + Math.floor(x)) * 4;
  return input.data.subarray(offset, offset + 4);
}

export function put(output, x, y, color) {
  x = Math.round(x);
  y = Math.round(y);
  if (!color[3] || x < 0 || y < 0 || x >= output.width || y >= output.height) return;
  output.data.set(color, (y * output.width + x) * 4);
}

export function mask(input, keep) {
  const output = blank(input.width, input.height);
  for (let y = 0; y < input.height; y++) for (let x = 0; x < input.width; x++) {
    if (!input.data[(y * input.width + x) * 4 + 3]) continue;
    const color = pixel(input, x, y);
    if (color[3] && keep(x, y, color)) put(output, x, y, color);
  }
  return output;
}

export function overlay(output, input, left = 0, top = 0) {
  for (let y = 0; y < input.height; y++) for (let x = 0; x < input.width; x++) {
    if (!input.data[(y * input.width + x) * 4 + 3]) continue;
    const color = pixel(input, x, y);
    blend(output, x + left, y + top, color);
  }
  return output;
}

export function blend(output, x, y, color) {
  if (!color[3]) return;
  if (color[3] === 255) { put(output, x, y, color); return; }
  const under = pixel(output, x, y);
  if (!under[3]) { put(output, x, y, color); return; }
  const alpha = color[3] / 255;
  const remaining = under[3] / 255 * (1 - alpha);
  const combined = alpha + remaining;
  put(output, x, y, [
    ...[0, 1, 2].map((channel) => Math.round((color[channel] * alpha + under[channel] * remaining) / combined)),
    Math.round(combined * 255),
  ]);
}

export function crop(input, left, top, width, height) {
  const output = blank(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) put(output, x, y, pixel(input, x + left, y + top));
  return output;
}

export function transform(input, a, b, c, d, tx, ty, width = nativeSize, height = nativeSize) {
  const output = blank(width, height);
  const determinant = a * d - b * c;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const localX = x - tx;
    const localY = y - ty;
    const sourceX = (d * localX - c * localY) / determinant;
    const sourceY = (-b * localX + a * localY) / determinant;
    put(output, x, y, sample(input, sourceX, sourceY));
  }
  return output;
}

export function move(input, dx, dy) {
  return overlay(blank(input.width, input.height), input, Math.round(dx), Math.round(dy));
}

export function sample(input, x, y) {
  const left = Math.floor(x);
  const top = Math.floor(y);
  const dx = x - left;
  const dy = y - top;
  let alpha = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  for (let row = 0; row < 2; row++) for (let column = 0; column < 2; column++) {
    const sx = left + column;
    const sy = top + row;
    if (sx < 0 || sy < 0 || sx >= input.width || sy >= input.height) continue;
    const index = (sy * input.width + sx) * 4;
    const weight = (column ? dx : 1 - dx) * (row ? dy : 1 - dy);
    const opacity = input.data[index + 3] * weight;
    alpha += opacity;
    red += input.data[index] * opacity;
    green += input.data[index + 1] * opacity;
    blue += input.data[index + 2] * opacity;
  }
  if (alpha < 1) return transparent;
  return [Math.round(red / alpha), Math.round(green / alpha), Math.round(blue / alpha), Math.round(alpha)];
}

export async function resize(input, width, height) {
  const { data, info } = await sharp(input.data, { raw: { width: input.width, height: input.height, channels: 4 } })
    .resize(width, height, { kernel: "lanczos3" }).raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export async function writeImage(input, path) {
  await sharp(input.data, { raw: { width: input.width, height: input.height, channels: 4 } }).png().toFile(path);
}
