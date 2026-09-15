import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rmdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { MikroORM } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";
import { createApplication } from "../src/app.js";
import { createDatabaseConfig } from "../src/persistence/database-config.js";
import { PostgreSqlDatabase } from "../src/persistence/postgresql-database.js";
import { PostgreSqlAuthRepository } from "../src/persistence/postgresql-auth-repository.js";
import { PostgreSqlWorkspaceRepository } from "../src/persistence/postgresql-workspace-repository.js";
import { assertEmptyWorkplaceDatabase, persistSimulatedWorkplace } from "../src/seeding/persist-workplace.js";
import { createSimulatedWorkplace, createWorkplaceAccounts } from "../src/seeding/workplace.js";

describe("simulated workplace persistence", () => {
  it("migrates a fresh database, rolls back failed seeds, restores the world and refuses to overwrite it", async () => {
    const databaseName = `workplace_check_${randomUUID().replaceAll("-", "")}`;
    const admin = await MikroORM.init(createDatabaseConfig({ ...process.env, POSTGRES_DB_NAME: "postgres" }));
    let created = false;
    let orm: MikroORM | undefined;
    const environment = { ...process.env, POSTGRES_DB_NAME: databaseName };
    try {
      await admin.em.getConnection().execute(`create database "${databaseName}"`);
      created = true;
      const config = createDatabaseConfig(environment);
      orm = await MikroORM.init({ ...config, migrations: { ...config.migrations, snapshot: false } });
      await expect(assertEmptyWorkplaceDatabase(orm.em.fork())).resolves.toBeUndefined();
      await orm.migrator.up();
      const workspace = createSimulatedWorkplace();
      const { auth } = await createWorkplaceAccounts(workspace);
      const invalid = structuredClone(auth);
      invalid.accounts[1]!.username = invalid.accounts[0]!.username;
      await expect(persistSimulatedWorkplace(orm, workspace, invalid)).rejects.toThrow();
      expect(await new PostgreSqlWorkspaceRepository(orm).load()).toBeUndefined();
      expect(await new PostgreSqlAuthRepository(orm).load()).toBeUndefined();
      await persistSimulatedWorkplace(orm, workspace, auth);
      await expect(assertEmptyWorkplaceDatabase(orm.em.fork())).rejects.toThrow("empty database");
      expect(await new PostgreSqlWorkspaceRepository(orm).load()).toEqual(workspace);
      await expect(persistSimulatedWorkplace(orm, workspace, auth)).rejects.toThrow("empty database");
      expect(await new PostgreSqlWorkspaceRepository(orm).load()).toEqual(workspace);
      const database = await PostgreSqlDatabase.connect(environment);
      const application = await createApplication({ database });
      try {
        for (const role of ["owner", "admin", "member", "guest"]) {
          const response = await application.app.inject({ method: "POST", url: "/v1/auth/login",
            payload: { identifier: role, password: "password" } });
          expect(response.statusCode).toBe(200);
          const { user } = response.json();
          expect(user.username).toBe(role);
          expect(application.store.getMembers().find(({ id }) => id === user.id)?.role).toBe(role);
        }
        expect(application.store.getMembers()).toHaveLength(16);
        expect(application.store.getFloors()).toHaveLength(3);
        expect(application.store.getOrganisation().units).toHaveLength(9);
        expect(application.runtime.serializePlayers()).toHaveLength(16);
        expect(application.store.needsSetup()).toBe(false);
      } finally { await application.app.close(); }
    } finally {
      await orm?.close(true);
      if (created) await admin.em.getConnection().execute(`drop database "${databaseName}" with (force)`);
      await admin.close(true);
    }
  }, 60_000);

  it("runs the CLI with explicit arguments and keeps credentials out of its output", async () => {
    const databaseName = `workplace_cli_${randomUUID().replaceAll("-", "")}`;
    const directory = await mkdtemp(join(tmpdir(), "workplace-cli-"));
    const credentialsPath = join(directory, "accounts.json");
    const admin = await MikroORM.init(createDatabaseConfig({ ...process.env, POSTGRES_DB_NAME: "postgres" }));
    let created = false;
    try {
      await admin.em.getConnection().execute(`create database "${databaseName}"`);
      created = true;
      const cli = fileURLToPath(new URL("../src/seeding/cli.ts", import.meta.url));
      const run = () => promisify(execFile)(process.execPath, ["--import", "tsx", cli, "--database", databaseName, "--credentials", credentialsPath],
        { cwd: fileURLToPath(new URL("../", import.meta.url)), timeout: 45_000, windowsHide: true });
      const result = await run();
      const saved = JSON.parse(await readFile(credentialsPath, "utf8")) as { database: string; accounts: { username: string; password: string }[] };
      expect(saved.database).toBe(databaseName);
      expect(saved.accounts).toHaveLength(16);
      expect(saved.accounts.map(({ username }) => username)).toEqual(expect.arrayContaining(["owner", "admin", "member", "guest"]));
      expect(new Set(saved.accounts.map(({ username }) => username)).size).toBe(16);
      expect(new Set(saved.accounts.map(({ password }) => password))).toEqual(new Set(["password"]));
      expect(result.stdout).toContain("Created Alder Works");
      for (const account of saved.accounts) expect(result.stdout + result.stderr).not.toContain(account.password);
      await expect(run()).rejects.toThrow("EEXIST");
    } finally {
      if (created) await admin.em.getConnection().execute(`drop database "${databaseName}" with (force)`);
      await admin.close(true);
      await unlink(credentialsPath).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
      await rmdir(directory);
    }
  }, 60_000);
});
