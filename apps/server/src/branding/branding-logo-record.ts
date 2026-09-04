export interface BrandingLogoReference {
  version: string;
}

export interface StoredBrandingLogo extends BrandingLogoReference {
  data: Buffer;
  mimeType: "image/webp";
  width: number;
  height: number;
}

export interface BrandingLogoWrite {
  data: Buffer;
  mimeType: "image/webp";
  width: number;
  height: number;
}
