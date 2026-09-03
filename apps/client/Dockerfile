# syntax=docker/dockerfile:1

FROM node:24.14-alpine AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN npm install --global corepack@0.34.6 && corepack enable

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/client/package.json apps/client/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @workhard/client...

COPY apps/client apps/client
COPY packages/shared packages/shared

ARG VITE_SERVER_URL=
RUN VITE_SERVER_URL="$VITE_SERVER_URL" pnpm --filter @workhard/client build

FROM nginxinc/nginx-unprivileged:1.29-alpine

COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/client/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["wget", "--quiet", "--output-document=/dev/null", "http://127.0.0.1:8080/"]
