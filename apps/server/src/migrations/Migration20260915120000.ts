import { Migration } from "@mikro-orm/migrations";

export class Migration20260915120000 extends Migration {
  override name = "Migration20260915120000";

  override up(): void {
    this.addSql(`update floor_layouts set objects = (
      select jsonb_agg(case when object->'workState'->>'kind' = 'whiteboard'
        then jsonb_set(object, '{workState}',
          ((object->'workState') - 'text') || jsonb_build_object('document',
            jsonb_build_object('text', object->'workState'->'text', 'cards', '[]'::jsonb)))
        else object end order by ordinal)
      from jsonb_array_elements(objects) with ordinality as entry(object, ordinal)
    ) where exists (
      select 1 from jsonb_array_elements(objects) as entry(object)
      where object->'workState'->>'kind' = 'whiteboard'
    );`);
  }
}
