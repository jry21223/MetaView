# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS build

WORKDIR /app

ARG NPM_REGISTRY=https://registry.npmmirror.com

COPY apps/agent/package.json apps/agent/tsconfig.json ./apps/agent/
COPY package.json ./
RUN --mount=type=cache,id=metaview-npm,target=/root/.npm,sharing=locked \
    npm install --workspace=apps/agent --no-audit --no-fund \
        --registry="${NPM_REGISTRY}" \
        --prefer-offline \
        --fetch-retries=5 \
        --fetch-retry-mintimeout=20000 \
        --fetch-retry-maxtimeout=120000

COPY apps/agent ./apps/agent
RUN npm --workspace apps/agent run build

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8001

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/agent/dist ./apps/agent/dist
COPY --from=build /app/apps/agent/package.json ./apps/agent/package.json

EXPOSE 8001
CMD ["node", "apps/agent/dist/server.js"]
