import { Migration } from "@mikro-orm/migrations";

export class Migration20260915180000 extends Migration {
  override up(): void {
    this.addSql('create table "whiteboard_images" ("id" varchar(64) not null, "image" bytea not null, "width" int not null, "height" int not null, constraint "whiteboard_images_pkey" primary key ("id"), constraint "whiteboard_images_data_check" check (octet_length(image) > 0 and width > 0 and height > 0));');
    this.addSql('create table "whiteboard_image_references" ("image_id" varchar(64) not null, "object_id" varchar(255) not null, "expires_at" timestamptz null, constraint "whiteboard_image_references_pkey" primary key ("image_id", "object_id"), constraint "whiteboard_image_references_image_id_foreign" foreign key ("image_id") references "whiteboard_images" ("id") on update cascade on delete cascade);');
    this.addSql('create index "whiteboard_image_references_expires_at_index" on "whiteboard_image_references" ("expires_at");');
  }

  override down(): void {
    this.addSql('drop table "whiteboard_image_references";');
    this.addSql('drop table "whiteboard_images";');
  }
}
