import { randomUUID } from "node:crypto";
import type { EntityManager, MikroORM } from "@mikro-orm/postgresql";
import type {
  BrandingLogoReference,
  BrandingLogoWrite,
  StoredBrandingLogo,
} from "../branding/branding-logo-record.js";
import { BrandingLogoEntity } from "./entities/index.js";

const BRANDING_LOGO_ID = "logo";

export class PostgreSqlBrandingLogoRepository {
  constructor(private readonly orm: MikroORM) {}

  async getReference(): Promise<BrandingLogoReference | undefined> {
    const logo = await this.orm.em.fork().findOne(
      BrandingLogoEntity,
      { id: BRANDING_LOGO_ID },
      { fields: ["version"] },
    );
    return logo ? { version: logo.version } : undefined;
  }

  async save(logo: BrandingLogoWrite): Promise<BrandingLogoReference> {
    const version = randomUUID();
    await this.orm.em.fork().upsert(BrandingLogoEntity, {
      id: BRANDING_LOGO_ID,
      image: logo.data,
      mimeType: logo.mimeType,
      width: logo.width,
      height: logo.height,
      version,
      updatedAt: new Date(),
    });
    return { version };
  }

  async read(): Promise<StoredBrandingLogo | undefined> {
    const logo = await this.orm.em.fork().findOne(BrandingLogoEntity, { id: BRANDING_LOGO_ID });
    if (!logo) {
      return undefined;
    }
    return {
      data: Buffer.from(logo.image),
      mimeType: "image/webp",
      width: logo.width,
      height: logo.height,
      version: logo.version,
    };
  }

  async remove(): Promise<boolean> {
    return (await this.orm.em.fork().nativeDelete(BrandingLogoEntity, { id: BRANDING_LOGO_ID })) > 0;
  }

  async clear(entityManager: EntityManager): Promise<void> {
    await entityManager.nativeDelete(BrandingLogoEntity, {});
  }
}
