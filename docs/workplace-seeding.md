# Workplace seeding

New servers start with a small studio, four windows, a terrace, a bench, a flower bed and one indoor plant. The studio is open to everyone, with no organisation assignments. The rest of the plot is free to build on. Existing saved buildings are preserved.

## Create the simulation

Create a separate, empty PostgreSQL database, using the same connection settings as the server. Do not start a server against it before seeding.

```sh
createdb --host <host> --port <port> --username <user> alder_simulation
pnpm seed:workplace --database alder_simulation --credentials artifacts/alder-credentials.json
```

The command reads `POSTGRES_DB_HOST`, `POSTGRES_DB_PORT`, `POSTGRES_DB_USERNAME` and `POSTGRES_DB_PASSWORD` from the environment or the repository's `.env.local`. `--database` is required and selects the seed target only. The command prints that target and the server database configured in its environment. It does not change the server configuration. Migrations run before the seed. The database must contain no application records; populated databases cause an error and remain untouched. There is no overwrite mode. Workspace and authentication records are saved in one transaction.

Seeded accounts use their role as the username and `password` as the password:

| Username | Password |
| --- | --- |
| `owner` | `password` |
| `admin` | `password` |
| `member` | `password` |
| `guest` | `password` |

Additional accounts with the same role use numbered usernames: `admin2` and `member2` through `member12`. The JSON credential file lists all 16 accounts. Relative paths start at the repository root, and the file must not already exist. If seeding fails, the file may remain, but its credentials will not have been installed.

## Connect the app

After seeding succeeds, set the following in the repository's `.env.local` for local development, or in the deployed server's environment:

```dotenv
POSTGRES_DB_NAME=alder_simulation
```

Restart the server. An already-running server retains its database connection and loaded world; changing `.env.local` or running the seeder does not reload either. An environment variable supplied by the shell or run configuration takes precedence over `.env.local`.

Reload the app and sign in using an account from the credential file. Sessions belong to their database, so an account from the previous database will not sign in to the simulation. `owner` is Rowan; `admin` and `admin2` are Imani and Elise. Application roles and organisation ranks remain separate.

The app should show **Alder Works** with **Studios & Commons**, **Library & Leadership** and **Maker Studios** in the floor selector. The local client proxies API and WebSocket requests to port 3001; the server's database setting determines which world it receives.

If the old world still appears, compare the printed seed target with the server's connection settings, restart the server, then reload and sign in again. Without `POSTGRES_DB_NAME`, the server defaults to `workHardPlayHard`. Seeding `alder_simulation` leaves that database, its edited buildings, accounts and external connections intact. Keep the previous database if you need to return to it; do not clear it to activate the simulation.

## Alder Works

The building has three floors and 21 rooms:

| Floor | Spaces |
| --- | --- |
| Studios & Commons | Engineering, design, Juniper meeting room, café, reception, games room, gallery and gardens |
| Library & Leadership | Three private offices, workshop, library, tea room, gallery and terraces |
| Maker Studios | Animation, sound, materials, craft, project library, winter garden, gallery and roof garden |

The layout uses all 231 catalogue assets, including 30 floor materials, supported desk decorations, usable seats, whiteboards, checklists, all three games and paired floor portals. Floors and decorations use catalogue footprints and placement rules.

Sixteen people belong to a nine-unit tree: Engineering (Platform, Web), Product (Design, Research), and Operations (Workplace, Customer Support). Rowan is CEO; department and team leads have appropriate assignments. Rowan, Imani and Lucia have knockable private offices. Team studios allow their department's members to furnish them; shared-space building defaults to Nobody.

Additional seed content includes 18 chat messages, room and direct conversations, three editable whiteboards, two checklists, two scheduled room meetings, one completed room meeting, six game results and their derived statistics and rewards. Three people have purchased personal plants on their desks and coffee decorations in inventory. Prices, transactions and placement ownership use the existing economy code.

Presence is a staged snapshot, with varied availability and saved player positions. The seed does not run autonomous coworkers, open microphones or cameras, create spontaneous-call markers, issue invitations, or connect external accounts. Fictional email addresses use `.example.test`.

The simulation is only imported by the seeding command and verification tools. Normal startup creates the starter house and restores saved data; it never imports the simulation. The older workspace fixtures remain confined to tests.

## Verification

```sh
pnpm --filter @workhard/server exec vitest run src/seeding/workplace.test.ts src/initial-data.test.ts
pnpm --filter @workhard/server exec vitest run tests/workplace-seed-persistence.test.ts
pnpm build:client
pnpm e2e:workplace
pnpm e2e
```

The geometry check covers every asset's placement, overlapping openings, detected room boundaries, accessible spawns, routes through every door, usable work objects and seating access. Relationship checks cover organisation grants, private offices, inventory ownership, game rewards and account passwords.

The PostgreSQL check creates and removes its own temporary database. It verifies migrations, atomic rollback, round trips, login after restart and refusal to overwrite a populated database. Its database user needs permission to create databases.

The browser check runs an isolated test application against the built client. It checks starter registration, walking onto the terrace, reload, all simulation floors, inert meeting-room entry and explicit meeting start. Captures are saved under `artifacts/workplace/`. Set `CLIENT_DIST` to use a different client build directory.
