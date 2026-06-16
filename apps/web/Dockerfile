# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS build

WORKDIR /app

ARG VITE_API_BASE_URL=
ARG VITE_APP_EDITION=self
ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_APP_EDITION=${VITE_APP_EDITION}

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN --mount=type=cache,id=metaview-npm,target=/root/.npm,sharing=locked \
    npm install \
        --registry="${NPM_REGISTRY}" \
        --prefer-offline \
        --fetch-retries=5 \
        --fetch-retry-mintimeout=20000 \
        --fetch-retry-maxtimeout=120000

COPY apps/web ./apps/web
RUN npm --workspace apps/web run build

FROM nginx:1.27-alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
