import { mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { MikroORM } from "@mikro-orm/postgresql";
import { createDatabaseConfig } from "../persistence/database-config.js";
import { assertEmptyWorkplaceDatabase, persistSimulatedWorkplace } from "./persist-workplace.js";
import { createSimulatedWorkplace, createWorkplaceAccounts } from "./workplace.js";

const { values } = parseArgs({ options: {
  database: { type: "string" }, credentials: { type: "string" }, help: { type: "boolean" },
} });

if (values.help) {
  process.stdout.write("pnpm seed:workplace --database <empty-database> --credentials <new-json-file>\nConnection settings use POSTGRES_DB_HOST, POSTGRES_DB_PORT, POSTGRES_DB_USERNAME and POSTGRES_DB_PASSWORD.\nAfter seeding, set the server's POSTGRES_DB_NAME to the target database and restart it.\n");
} else {
  if (!values.database || !values.credentials) throw new Error("Both --database and --credentials are required. Use --help for usage.");
  const serverConfig = createDatabaseConfig();
  const seedConfig = createDatabaseConfig({ ...process.env, POSTGRES_DB_NAME: values.database });
  process.stdout.write(`Seed target: ${seedConfig.host}:${seedConfig.port}/${seedConfig.dbName}\nServer database configured in this environment: ${serverConfig.dbName}\n`);
  const credentialsPath = resolve(fileURLToPath(new URL("../../../../", import.meta.url)), values.credentials);
  const workspace = createSimulatedWorkplace();
  const { auth, credentials } = await createWorkplaceAccounts(workspace);
  await mkdir(dirname(credentialsPath), { recursive: true });
  const file = await open(credentialsPath, "wx", 0o600);
  let orm: MikroORM | undefined;
  try {
    await file.writeFile(JSON.stringify({ database: values.database, accounts: credentials }, null, 2) + "\n");
    await file.sync();
    orm = await MikroORM.init({ ...seedConfig, migrations: { ...seedConfig.migrations, snapshot: false } });
    await assertEmptyWorkplaceDatabase(orm.em.fork());
    await orm.migrator.up();
    await persistSimulatedWorkplace(orm, workspace, auth);
    process.stdout.write(`Created Alder Works: ${workspace.store.members.length} people, ${workspace.store.organisation.units.length} units, ${workspace.store.layouts.flatMap((layout) => layout.rooms).length} rooms.\nCredentials: ${credentialsPath}\nSet POSTGRES_DB_NAME=${values.database} in the server environment or .env.local, then restart the server.\nReload the app and sign in with an account from the credential file.\n`);
  } finally {
    await file.close();
    await orm?.close(true);
  }
}
