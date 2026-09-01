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

Requires Node.js 24 and pnpm 10.33.2.

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

The web build uses the current origin by default. Desktop and Android packages need `VITE_SERVER_URL` set to the HTTPS server origin. Copy `apps/client/.env.example` to `apps/client/.env.production` and set the deployment URL before packaging.

```sh
pnpm build:client
pnpm build:desktop
pnpm android:init
pnpm build:android
```

Tauri desktop builds require Rust and the platform prerequisites. Android additionally requires JDK 21, the Android SDK, NDK, build tools, and Rust Android targets. `android:init` generates `apps/client/src-tauri/gen/android`; the generated project is intentionally not committed.

## Server configuration

- `CLIENT_URL`: web client URL used for sign-in links
- `CLIENT_ORIGINS`: comma-separated additional web client origins
- `HOST`: bind address, default `127.0.0.1`
- `PORT`: server port, default `3001`

Packaged Tauri origins are enabled by the server. Production sessions require HTTPS.

## Containers

Build both images from the repository root.

```sh
docker build -f apps/server/Dockerfile -t northstar-server .
docker build --build-arg VITE_CLIENT_URL=https://app.example.com -f apps/landing/Dockerfile -t northstar-landing .
```

The server listens on port 3001 and stores runtime data in `/workspace/.data`. The landing image listens on port 8080.
