import sharp from "sharp";

export const BRANDING_LOGO_MAX_BYTES = 5 * 1024 * 1024;

export class BrandingLogoInputError extends Error {
  constructor() {
    super("BRANDING_LOGO_INVALID");
    this.name = "BrandingLogoInputError";
  }
}

export async function processBrandingLogo(source: Buffer) {
  try {
    const { data, info } = await sharp(source, {
      animated: false,
      failOn: "warning",
      limitInputPixels: 25_000_000,
    })
      .rotate()
      .resize(1024, 512, { fit: "inside", withoutEnlargement: true })
      .webp({ effort: 4, quality: 88, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });
    return {
      data,
      mimeType: "image/webp" as const,
      width: info.width,
      height: info.height,
    };
  } catch {
    throw new BrandingLogoInputError();
  }
}
