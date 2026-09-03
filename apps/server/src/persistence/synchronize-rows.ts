import type { EntityName, RequiredEntityData } from "@mikro-orm/core";
import type { EntityManager } from "@mikro-orm/postgresql";

export async function synchronizeRows<Entity extends object, Key extends keyof Entity & string>(
  entityManager: EntityManager,
  entityName: EntityName<Entity>,
  primaryKey: Key,
  rows: RequiredEntityData<Entity>[],
): Promise<void> {
  if (rows.length > 0) {
    await entityManager.upsertMany(entityName, rows as never[]);
  }
  const ids = rows.map((row) => (row as Record<string, unknown>)[primaryKey]);
  const where = ids.length > 0
    ? { [primaryKey]: { $nin: ids } }
    : {};
  await entityManager.nativeDelete(entityName, where as never);
}
