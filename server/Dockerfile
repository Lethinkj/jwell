# syntax=docker/dockerfile:1
#
# API image — Express + Supabase Postgres.
#
# There is no build step: `node server/src/index.js` is the whole story. Two
# monorepo facts shape this file, so don't "simplify" the COPYs away:
#   1. server/src/services/pricing.js requires ../../../packages/pricing/src/index.js
#      (a path OUTSIDE the server/ workspace) — so packages/ must ship too.
#   2. server/src/db.js reads supabase/migrations/*_pg.sql at boot — so supabase/
#      must ship too. Migrations run automatically (idempotent, advisory-locked).
#
# Build context MUST be the repo root. See docker-compose.yml.

FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# --- 1) Dependency layer (cached until a manifest or the lockfile changes) ---
# npm workspaces require every workspace manifest to be present for `npm ci` to
# validate against package-lock.json, so copy each one before installing.
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/pricing/package.json ./packages/pricing/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/validation/package.json ./packages/validation/package.json
# No native addons (bcryptjs/pg/nodemailer are pure JS) — no build tools needed.
RUN npm ci --omit=dev

# --- 2) Application code ---
COPY server ./server
COPY packages ./packages
COPY supabase ./supabase

# The official image ships a non-root `node` user.
USER node

EXPOSE 4000

# /api/health returns 200 only once the DB pool is reachable.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/api/health >/dev/null 2>&1 || exit 1

CMD ["node", "server/src/index.js"]
