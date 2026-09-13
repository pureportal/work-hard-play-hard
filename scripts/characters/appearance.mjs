import { blank, crop, pixel, put, readImage, sample } from "./raster.mjs";
import { clearWhite, interpolate, sourceScale, sourceSize } from "./wardrobe.mjs";
import { keyGreen, placeEquipment } from "./equipment.mjs";

const directions = ["down", "left", "up"];

export async function loadHeads() {
  const sheet = await readImage("heads");
  const result = {};
  const centers = [139, 389, 641, 894, 1146, 1400];
  const tops = [0, 344, 660, 1024];
  for (const gender of ["female", "male"]) {
    result[gender] = {};
    for (const [row, direction] of directions.entries()) {
      result[gender][direction] = {};
      for (const [expressionIndex, expression] of ["calm", "bright", "fierce"].entries()) {
        const column = expressionIndex + (gender === "male" ? 3 : 0);
        const source = clearWhite(crop(sheet, column * 256, tops[row], 256, tops[row + 1] - tops[row]));
        const output = blank(sourceSize, sourceSize);
        const scalp = row === 0 ? 49 : row === 1 ? 363 : 669;
        const chin = row === 0 ? (gender === "female" ? 277 : 288) : row === 1 ? (gender === "female" ? 591 : 599) : 891;
        const end = row === 0 ? 336 : row === 1 ? 642 : 944;
        const center = direction === "left" ? centers[column] - 7 : centers[column];
        for (let y = 11 * sourceScale; y < 44 * sourceScale; y++) {
          const logicalY = y / sourceScale;
          const sy = interpolate(logicalY, [12, 36, 44], [scalp, chin, end]) - tops[row];
          const neck = Math.max(0, Math.min(1, (logicalY - 36) / 8));
          const xScale = 0.106 * (1 - neck * (gender === "male" ? 0.23 : 0.12));
          for (let x = 74 * sourceScale; x < 106 * sourceScale; x++) {
            put(output, x, y, sample(source, center - column * 256 + (x / sourceScale - 90) / xScale, sy));
          }
        }
        result[gender][direction][expression] = output;
      }
    }
  }
  return result;
}

export async function loadHair() {
  const result = {};
  for (const headwear of ["none", "cap", "witch"]) {
    const sheet = keyGreen(await readImage(headwear === "none" ? "hair" : `hair-${headwear}`));
    const rows = headwear === "witch" ? [0, 407, 797, 1254] : [0, 412, 807, 1254];
    const columns = headwear === "witch" ? [0, 415, 815, 1254] : headwear === "cap" ? [0, 400, 797, 1254] : [0, 418, 815, 1254];
    const anchors = headwear === "witch" ? [
      [[212, 349], [618, 347], [1008, 352]],
      [[242, 652], [646, 652], [1037, 650]],
      [[211, 1140], [615, 1140], [1010, 1140]],
    ] : [
      [[217, 354], [618, 354], [1015, 354]],
      [[236, 641], [642, 641], [1039, 641]],
      [[217, 1128], [618, 1128], [1015, 1128]],
    ];
    for (const [column, hairstyle] of ["bob", "spiky", "ponytail"].entries()) {
      const name = `${hairstyle}${headwear === "none" ? "" : `-${headwear}`}`;
      result[name] = {};
      for (const [row, direction] of directions.entries()) {
        const source = crop(sheet, columns[column], rows[row], columns[column + 1] - columns[column], rows[row + 1] - rows[row]);
        const anchor = [anchors[row][column][0] - columns[column], anchors[row][column][1] - rows[row]];
        const scale = headwear === "witch" ? (direction === "left" ? 0.091 : 0.1) : 0.084;
        const placed = await placeEquipment(source, anchor, direction === "left" ? [95, 26.5] : [90, row === 2 ? 35 : 36], scale);
        result[name][direction] = headwear === "witch" ? fitHeadroom(placed) : placed;
      }
    }
  }
  return result;
}

function fitHeadroom(input) {
  const margin = 7 * sourceScale;
  let top = margin;
  for (let y = 0; y < top; y++) for (let x = 0; x < sourceSize; x++) {
    if (pixel(input, x, y)[3]) { top = y; break; }
  }
  const output = blank(sourceSize, sourceSize);
  const brim = 22 * sourceScale;
  for (let y = margin; y < sourceSize; y++) {
    const sourceY = y < brim ? top + (y - margin) * (brim - top) / (brim - margin) : y;
    for (let x = 0; x < sourceSize; x++) put(output, x, y, sample(input, x, sourceY));
  }
  return output;
}

export function fitTop(wardrobe, gender, direction, outfit, fit) {
  const sourceGender = fit === "none" ? "male" : "female";
  const source = wardrobe[sourceGender][direction][outfit];
  const output = blank(sourceSize, sourceSize);
  const widthScale = gender === sourceGender ? 1 : gender === "female" ? 36 / 43 : 43 / 36;
  const amount = { none: 0, flat: -0.14, medium: 0, big: 0.17 }[fit];
  for (let y = 37 * sourceScale; y < 113 * sourceScale; y++) {
    const logicalY = y / sourceScale;
    const envelope = Math.max(0, 1 - ((logicalY - 55) / 15) ** 2) ** 2;
    for (let x = 52 * sourceScale; x < 128 * sourceScale; x++) {
      const logicalX = x / sourceScale;
      const torso = Math.max(0, 1 - ((logicalX - 90) / 20) ** 4);
      const sx = direction === "left"
        ? 90 + (logicalX - 90) / widthScale + amount * 18 * envelope * torso
        : 90 + (logicalX - 90) / (widthScale * (1 + amount * envelope * torso));
      put(output, x, y, sample(source, sx * sourceScale, y));
    }
  }
  return output;
}
