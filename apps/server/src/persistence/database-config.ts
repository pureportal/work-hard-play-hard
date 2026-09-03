import { fileURLToPath } from "node:url";
import { Migrator } from "@mikro-orm/migrations";
import { defineConfig, type Options } from "@mikro-orm/postgresql";
import { databaseEntities } from "./entities/index.js";

export interface PostgreSqlEnvironment {
  POSTGRES_DB_NAME?: string;
  POSTGRES_DB_HOST?: string;
  POSTGRES_DB_PORT?: string;
  POSTGRES_DB_USERNAME?: string;
  POSTGRES_DB_PASSWORD?: string;
}

export function createDatabaseConfig(environment: PostgreSqlEnvironment = process.env): Options {
  const port = Number(environment.POSTGRES_DB_PORT ?? "5432");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("POSTGRES_DB_PORT_INVALID");
  }

  return defineConfig({
    dbName: environment.POSTGRES_DB_NAME ?? "workHardPlayHard",
    host: environment.POSTGRES_DB_HOST ?? "10.10.0.1",
    port,
    user: environment.POSTGRES_DB_USERNAME ?? "postgres",
    password: environment.POSTGRES_DB_PASSWORD ?? "postgres",
    entities: databaseEntities,
    extensions: [Migrator],
    migrations: {
      path: fileURLToPath(new URL("./migrations", import.meta.url)),
      pathTs: fileURLToPath(new URL("../migrations", import.meta.url)),
      transactional: true,
      allOrNothing: true,
    },
  });
}
