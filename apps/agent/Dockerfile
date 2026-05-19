FROM node:22-alpine AS build

WORKDIR /app

COPY apps/agent/package.json apps/agent/tsconfig.json ./apps/agent/
COPY package.json ./
RUN npm install --workspace=apps/agent --no-audit --no-fund

COPY apps/agent ./apps/agent
RUN npm --workspace apps/agent run build

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8001

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/agent/node_modules ./apps/agent/node_modules
COPY --from=build /app/apps/agent/dist ./apps/agent/dist
COPY --from=build /app/apps/agent/package.json ./apps/agent/package.json

EXPOSE 8001
CMD ["node", "apps/agent/dist/server.js"]
