import { Migration } from "@mikro-orm/migrations";

export class Migration20260917140000 extends Migration {
  override up(): void {
    this.addSql('create table "chat_images" ("id" varchar(36) not null, "image" bytea not null, constraint "chat_images_pkey" primary key ("id"), constraint "chat_images_image_check" check (octet_length(image) > 0));');
  }

  override down(): void {
    this.addSql('drop table "chat_images";');
  }
}
