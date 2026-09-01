# syntax=docker/dockerfile:1

FROM node:24.14-alpine AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN npm install --global corepack@0.34.6 && corepack enable

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/landing/package.json apps/landing/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @workhard/landing...

COPY apps/landing apps/landing

ARG VITE_CLIENT_URL=/app/
RUN VITE_CLIENT_URL="$VITE_CLIENT_URL" pnpm --filter @workhard/landing build

FROM nginxinc/nginx-unprivileged:1.29-alpine

COPY --from=build /workspace/apps/landing/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["wget", "--quiet", "--output-document=/dev/null", "http://127.0.0.1:8080/"]
