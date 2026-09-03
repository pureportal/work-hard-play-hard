import { describe, expect, it } from "vitest";
import { createDatabaseConfig } from "./database-config.js";

describe("PostgreSQL configuration", () => {
  it("uses the configured server defaults", () => {
    const config = createDatabaseConfig({});

    expect(config).toMatchObject({
      dbName: "workHardPlayHard",
      host: "10.10.0.1",
      port: 5432,
      user: "postgres",
      password: "postgres",
    });
  });

  it("rejects an invalid database port", () => {
    expect(() => createDatabaseConfig({ POSTGRES_DB_PORT: "not-a-port" })).toThrow("POSTGRES_DB_PORT_INVALID");
  });
});
