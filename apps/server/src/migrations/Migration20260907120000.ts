import { Migration } from "@mikro-orm/migrations";

export class Migration20260907120000 extends Migration {
  override name = "Migration20260907120000";

  override up(): void {
    this.addSql(`update "members" set "character" = jsonb_build_object(
      'gender', (array['female', 'male'])[1 + floor(random() * 2)::int],
      'breastSize', (array['none', 'flat', 'medium', 'big'])[1 + floor(random() * 4)::int],
      'face', (array['calm', 'bright', 'fierce'])[1 + floor(random() * 3)::int],
      'hairstyle', (array['bob', 'spiky', 'ponytail'])[1 + floor(random() * 3)::int],
      'upperBody', (array['street', 'ranger', 'arcane'])[1 + floor(random() * 3)::int],
      'lowerBody', (array['street', 'ranger', 'arcane'])[1 + floor(random() * 3)::int],
      'shoes', (array['street', 'ranger', 'arcane'])[1 + floor(random() * 3)::int],
      'headwear', (array['none', 'cap', 'witch'])[1 + floor(random() * 3)::int]
    ) where "character" is null;`);
    this.addSql('alter table "members" alter column "character" set not null;');
    this.addSql('drop table "player_avatars";');
  }
}
