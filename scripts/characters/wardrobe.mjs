import { blank, crop, pixel, put, readImage, sample } from "./raster.mjs";
import { keyGreen } from "./equipment.mjs";
import { CHARACTER_CANVAS_SIZE, CHARACTER_PORTRAIT_SCALE } from "../../packages/shared/src/character.ts";

export const sourceScale = CHARACTER_PORTRAIT_SCALE;
export const sourceSize = CHARACTER_CANVAS_SIZE * sourceScale;
const outfits = ["street", "ranger", "arcane"];
const directions = ["down", "left", "up"];
const columns = [0, 429, 820, 1254];
const targetJoints = [38, 43, 74, 108];
const garmentRows = [0, 420, 816, 1254];
const garmentCenters = {
  female: [[235, 628, 1018], [242, 623, 1004], [235, 628, 1018]],
  male: [[237, 627, 1015], [242, 608, 997], [237, 627, 1015]],
};
const garmentJoints = {
  female: [
    [[73, 94, 264, 399], [70, 95, 237, 399], [71, 96, 260, 399]],
    [[456, 478, 657, 802], [460, 483, 638, 803], [458, 484, 639, 803]],
    [[855, 880, 1035, 1180], [855, 877, 1015, 1180], [855, 879, 1030, 1180]],
  ],
  male: [
    [[62, 88, 290, 409], [63, 91, 251, 409], [61, 89, 261, 411]],
    [[430, 458, 660, 804], [429, 460, 630, 804], [431, 461, 624, 804]],
    [[828, 856, 1042, 1181], [829, 856, 1017, 1181], [829, 853, 1030, 1186]],
  ],
};

export function clearWhite(input) {
  const output = { ...input, data: Buffer.from(input.data) };
  const visited = new Uint8Array(input.width * input.height);
  const queue = new Int32Array(visited.length);
  let length = 0;
  const add = (x, y) => {
    if (x < 0 || y < 0 || x >= input.width || y >= input.height) return;
    const index = y * input.width + x;
    if (visited[index]) return;
    visited[index] = 1;
    const [r, g, b, a] = pixel(input, x, y);
    if (a && (Math.min(r, g, b) < 231 || Math.max(r, g, b) - Math.min(r, g, b) > 18)) return;
    output.data.fill(0, index * 4, index * 4 + 4);
    queue[length++] = index;
  };
  for (let x = 0; x < input.width; x++) { add(x, 0); add(x, input.height - 1); }
  for (let y = 0; y < input.height; y++) { add(0, y); add(input.width - 1, y); }
  for (let cursor = 0; cursor < length; cursor++) {
    const index = queue[cursor];
    const x = index % input.width;
    const y = Math.floor(index / input.width);
    add(x - 1, y); add(x + 1, y); add(x, y - 1); add(x, y + 1);
  }
  return output;
}

export function interpolate(value, from, to) {
  let index = from.findIndex((point) => point > value) - 1;
  if (index === -2) index = from.length - 2;
  index = Math.max(0, index);
  return to[index] + (value - from[index]) / (from[index + 1] - from[index]) * (to[index + 1] - to[index]);
}

function normalizeTop(input, joints, center, gender, direction) {
  const output = blank(sourceSize, sourceSize);
  const shoulderWidth = gender === "female" ? 36 : 43;
  const sourceShoulderY = joints[1] + (joints[2] - joints[1]) * 0.2;
  let left = center;
  let right = center;
  for (let x = 0; x < input.width; x++) if (pixel(input, x, sourceShoulderY)[3]) { left = Math.min(left, x); right = Math.max(right, x); }
  const widthScale = direction === "left" ? (gender === "female" ? 0.175 : 0.185) : shoulderWidth / (right - left);
  for (let y = 0; y < sourceSize; y++) {
    const logicalY = y / sourceScale;
    if (logicalY < 38 || logicalY > 111) continue;
    const sy = interpolate(logicalY, targetJoints, joints);
    for (let x = 45 * sourceScale; x < 135 * sourceScale; x++) {
      put(output, x, y, sample(input, center + (x / sourceScale - 90) / widthScale, sy));
    }
  }
  return output;
}

export async function loadWardrobe() {
  const wardrobe = {};
  for (const gender of ["female", "male"]) {
    const sheet = keyGreen(await readImage(`${gender}-wardrobe`));
    wardrobe[gender] = {};
    for (const [row, direction] of directions.entries()) {
      wardrobe[gender][direction] = {};
      for (const [column, outfit] of outfits.entries()) {
        const top = garmentRows[row];
        const source = crop(sheet, columns[column], top, columns[column + 1] - columns[column], garmentRows[row + 1] - top);
        wardrobe[gender][direction][outfit] = normalizeTop(source, garmentJoints[gender][row][column].map((y) => y - top), garmentCenters[gender][row][column] - columns[column], gender, direction);
      }
    }
  }
  return wardrobe;
}

export async function loadTrousers() {
  const sheet = await readImage("lower");
  const xCenters = [175, 403, 630, 899, 1138, 1376];
  const edges = [0, 285, 520, 757, 1020, 1250, 1536];
  const rowEdges = [0, 344, 662, 1024];
  const joints = [[17, 86, 192, 306], [352, 416, 508, 625], [668, 737, 833, 958]];
  const result = {};
  for (const gender of ["female", "male"]) {
    result[gender] = {};
    for (const [row, direction] of directions.entries()) {
      result[gender][direction] = {};
      for (const [outfitIndex, outfit] of outfits.entries()) {
        const column = outfitIndex + (gender === "male" ? 3 : 0);
        const source = clearWhite(crop(sheet, edges[column], rowEdges[row], edges[column + 1] - edges[column], rowEdges[row + 1] - rowEdges[row]));
        const output = blank(sourceSize, sourceSize);
        const center = xCenters[column] - edges[column];
        const xScale = direction === "left" ? 0.285 : 0.235;
        for (let y = 72 * sourceScale; y < 162 * sourceScale; y++) {
          const sy = interpolate(y / sourceScale, [73, 95, 128, 160], joints[row]) - rowEdges[row];
          for (let x = 65 * sourceScale; x < 115 * sourceScale; x++) {
            put(output, x, y, sample(source, center + (x / sourceScale - 90) / xScale, sy));
          }
        }
        result[gender][direction][outfit] = output;
      }
    }
  }
  return result;
}
