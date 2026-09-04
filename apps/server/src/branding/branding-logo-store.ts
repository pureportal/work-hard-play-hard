import type { ApplicationDatabase } from "../persistence/application-database.js";
import type {
  BrandingLogoReference,
  BrandingLogoWrite,
  StoredBrandingLogo,
} from "./branding-logo-record.js";

export type { BrandingLogoReference } from "./branding-logo-record.js";

export class BrandingLogoStore {
  constructor(private readonly database: ApplicationDatabase) {}

  getReference(): Promise<BrandingLogoReference | undefined> {
    return this.database.getBrandingLogoReference();
  }

  save(logo: BrandingLogoWrite): Promise<BrandingLogoReference> {
    return this.database.saveBrandingLogo(logo);
  }

  read(): Promise<StoredBrandingLogo | undefined> {
    return this.database.readBrandingLogo();
  }

  remove(): Promise<boolean> {
    return this.database.removeBrandingLogo();
  }
}
