# syntax=docker/dockerfile:1
#
# Web image — builds the Vite SPA, then serves it with nginx and proxies /api to
# the `api` service on the compose network.
#
# Build context MUST be the repo root (npm workspaces + package-lock.json live
# there). See docker-compose.yml.

# ---------- build stage ----------
FROM node:22-alpine AS build
WORKDIR /app

# Manifests first, for layer caching. All workspace manifests must be present so
# `npm ci` matches package-lock.json.
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY server/package.json ./server/package.json
COPY packages/pricing/package.json ./packages/pricing/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/validation/package.json ./packages/validation/package.json
# Full install here (needs typescript + vite devDeps for `tsc --noEmit && vite build`).
RUN npm ci

COPY apps/web ./apps/web
COPY packages ./packages
# NOTE: VITE_API_URL is deliberately left unset so the SPA falls back to the
# relative "/api" (apps/web/src/lib/api.ts) and rides through this nginx proxy.
# Never bake a hostname into the build.
RUN npm run build -w web

# ---------- runtime stage ----------
FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
