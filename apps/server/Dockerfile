# syntax=docker/dockerfile:1

FROM node:24.14-alpine AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN npm install --global corepack@0.34.6 && corepack enable

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server apps/server
COPY packages/shared packages/shared

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @workhard/server...

RUN pnpm --filter @workhard/server build
RUN pnpm --filter @workhard/server --prod deploy /opt/server

FROM node:24.14-alpine

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

WORKDIR /workspace/apps/server

RUN mkdir -p /workspace/.data && chown node:node /workspace/.data

COPY --from=build --chown=node:node /opt/server ./

USER node

EXPOSE 3001
VOLUME ["/workspace/.data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["wget", "--quiet", "--output-document=/dev/null", "http://127.0.0.1:3001/v1/health/ready"]

CMD ["node", "dist/index.js"]
