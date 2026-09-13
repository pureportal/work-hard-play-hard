export function isBackdropColor(red, green, blue) {
  const pixel = hsv(red, green, blue);
  return pixel.hue >= 295 && pixel.hue <= 335 && pixel.saturation > 0.5 && pixel.value > 0.4;
}

export function removeMagenta(data) {
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    if (isBackdropColor(red, green, blue)) data[index + 3] = 0;
  }
}

function hsv(red, green, blue) {
  const high = Math.max(red, green, blue);
  const low = Math.min(red, green, blue);
  const delta = high - low;
  let hue = 0;
  if (delta > 0) {
    if (high === red) hue = ((green - blue) / delta + 6) % 6;
    else if (high === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
  }
  return { hue: hue * 60, saturation: high === 0 ? 0 : delta / high, value: high / 255 };
}

function rgb(hue, saturation, value) {
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const offset = value - chroma;
  const sector = Math.floor(hue / 60) % 6;
  const channels = [[chroma, x, 0], [x, chroma, 0], [0, chroma, x], [0, x, chroma], [x, 0, chroma], [chroma, 0, x]][sector];
  return channels.map((channel) => Math.round((channel + offset) * 255));
}

function color(value) {
  return hsv(...[1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)));
}

export function recolorMaterial(input, base, target, assetId) {
  const result = Buffer.from(input);
  const from = color(base.color);
  const to = color(target.color);
  const neutralMaterial = from.saturation < 0.12 || assetId === "outdoor-pool";
  for (let index = 0; index < result.length; index += 4) {
    if (result[index + 3] === 0) continue;
    const pixel = hsv(result[index], result[index + 1], result[index + 2]);
    if ((assetId === "decor-monitor" || assetId === "decor-laptop") && pixel.hue >= 190 && pixel.hue <= 240 && pixel.saturation > 0.35) continue;
    const distance = Math.min(Math.abs(pixel.hue - from.hue), 360 - Math.abs(pixel.hue - from.hue));
    const matches = assetId === "infrastructure-portal"
      ? pixel.hue >= 245 && pixel.hue <= 294 && pixel.saturation > 0.15 && pixel.value > 0.16
      : assetId === "outdoor-fountain" || assetId === "outdoor-lantern"
      ? pixel.hue >= 205 && pixel.hue <= 245 && pixel.saturation > 0.25 && pixel.value > 0.13
      : base.id === "mint"
        ? distance < 35 && pixel.saturation > 0.1 && pixel.value > 0.16
      : base.id === "graphite"
        ? (pixel.saturation < 0.2 || (pixel.hue >= 190 && pixel.hue <= 310 && pixel.saturation < 0.55)) && pixel.value > 0.16 && pixel.value < 0.8
      : base.id === "forest"
      ? pixel.hue >= 65 && pixel.hue <= 175 && pixel.saturation > 0.15 && pixel.value > 0.13
      : neutralMaterial
      ? pixel.saturation < 0.2 && pixel.value > 0.5
      : from.saturation < 0.32
        ? pixel.saturation < 0.3 && pixel.value > 0.16 && pixel.value < 0.75
        : distance < 32 && pixel.saturation > 0.18 && pixel.value > 0.13;
    if (!matches) continue;
    const value = Math.min(1, Math.max(0.06, pixel.value + to.value - (neutralMaterial ? 0.88 : from.value)));
    const saturation = Math.min(0.9, Math.max(0, to.saturation + (pixel.saturation - from.saturation) * 0.2));
    const replacement = rgb(to.hue, saturation, value);
    result[index] = replacement[0];
    result[index + 1] = replacement[1];
    result[index + 2] = replacement[2];
  }
  return result;
}
