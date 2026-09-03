# Work Hard, Play Hard

Northstar is a virtual office with an authoritative realtime server and one client shared by web, desktop, and Android.

## Workspace

```text
apps/
  landing/  Public Vite site
  server/   Fastify REST and WebSocket server
  client/   React game client and Tauri shell
packages/
  shared/   Realtime protocol and shared domain types
```

## Development

Requires Node.js 24, pnpm 10.33.2, and PostgreSQL.

```sh
pnpm install
pnpm dev
```

The server runs on port 3001 and the web client on port 5173. The client development server proxies `/v1` to the server.

```sh
pnpm dev:landing
pnpm dev:desktop
pnpm check
pnpm e2e
```

## Client builds

The web build uses its current origin by default. Packaged clients can select another server from the sign-in screen. Set `VITE_SERVER_URL` in `apps/client/.env.production` only when a package needs a preconfigured default.

```sh
pnpm build:client
pnpm build:desktop
pnpm android:init
pnpm build:android
pnpm build:android:signed
```

Tauri desktop builds require Rust and the platform prerequisites. Android additionally requires JDK 21, the Android SDK, NDK, build tools, and Rust Android targets. `android:init` generates `apps/client/src-tauri/gen/android`; the generated project is intentionally not committed. Signed APKs use the `ANDROID_BUILD_TOOLS_VERSION`, `ANDROID_SIGNING_STORE_FILE`, `ANDROID_SIGNING_STORE_PASSWORD`, `ANDROID_SIGNING_KEY_ALIAS`, and `ANDROID_SIGNING_KEY_PASSWORD` environment variables. CI uses Android build tools 36.1.0.

## Server configuration

- `CLIENT_URL`: web client URL used for sign-in links
- `CLIENT_ORIGINS`: comma-separated additional web client origins
- `HOST`: bind address, default `127.0.0.1`
- `PORT`: server port, default `3001`
- `POSTGRES_DB_NAME`: database name, default `workHardPlayHard`
- `POSTGRES_DB_HOST`: database host, default `10.10.0.1`
- `POSTGRES_DB_PORT`: database port, default `5432`
- `POSTGRES_DB_USERNAME`: database user, default `postgres`
- `POSTGRES_DB_PASSWORD`: database password, default `postgres`

The server applies pending MikroORM migrations before it begins listening. Migration commands are available through the server package:

```sh
pnpm --filter @workhard/server migration:up
pnpm --filter @workhard/server migration:create
```

Packaged Tauri origins are enabled by the server. Production sessions require HTTPS.

## Self-hosting

Copy the environment template, change the database password, and start the application stack.

```sh
cp .env.example .env
docker compose up --build --wait
```

The client is available on port 8080 by default. Set `NORTHSTAR_PUBLIC_URL` to its external HTTPS origin when deploying behind a reverse proxy. PostgreSQL and uploaded images use named volumes.

Build individual images from the repository root.

```sh
docker build -f apps/server/Dockerfile -t northstar-server .
docker build -f apps/client/Dockerfile -t northstar-client .
docker build --build-arg VITE_CLIENT_URL=https://app.example.com -f apps/landing/Dockerfile -t northstar-landing .
```

The server listens on port 3001. The client and landing images listen on port 8080.

## Releases

Pushes to `main` validate the complete workspace and publish `main` and commit-tagged images to GHCR. A version change creates versioned images and a GitHub Release containing desktop packages, a signed universal APK, and checksums. Versions in the workspace packages, Tauri configuration, and Cargo files must match.

Configure `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` as GitHub Actions secrets. `NORTHSTAR_SERVER_URL` is an optional Actions variable for the packaged-client default.
