import { blank, crop, overlay, readImage } from "./raster.mjs";
import { keyGreen, placeEquipment } from "./equipment.mjs";
import { sourceSize } from "./wardrobe.mjs";

export async function loadShoes() {
  const sheet = keyGreen(await readImage("shoes"));
  const rows = [0, 408, 804, 1254];
  const anchors = [
    [[128, 288], [547, 711], [953, 1113]],
    [[301], [679], [1107]],
    [[128, 285], [545, 710], [949, 1114]],
  ];
  const baselines = [380, 774, 1172];
  const result = {};
  for (const gender of ["female", "male"]) {
    result[gender] = {};
    for (const [row, direction] of ["down", "left", "up"].entries()) {
      result[gender][direction] = {};
      for (const [column, outfit] of ["street", "ranger", "arcane"].entries()) {
        const output = blank(sourceSize, sourceSize);
        const centers = anchors[row][column];
        for (const [index, center] of centers.entries()) {
          const left = column * 418 + (direction === "left" ? 0 : index * 209);
          const source = crop(sheet, left, rows[row], direction === "left" ? 418 : 209, rows[row + 1] - rows[row]);
          const ankle = direction === "left" ? 94 : 90 + (index === 0 ? -1 : 1) * (gender === "female" ? 11.5 : 13);
          const scaleX = direction === "left" ? 0.088 : gender === "female" ? 0.089 : 0.097;
          const scaleY = outfit === "street" ? (direction === "left" ? 0.12 : 0.105) : 0.112;
          overlay(output, await placeEquipment(source, [center - left, baselines[row] - rows[row]], [ankle, 172], scaleX, scaleY));
        }
        result[gender][direction][outfit] = output;
      }
    }
  }
  return result;
}
