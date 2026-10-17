# Deploy (Docker Compose + Apache/Webuzo)

Two containers, one published loopback port. **Apache (Webuzo)** on the host owns
ports 80/443 and TLS; it reverse-proxies to the web container.

```
Internet ─▶ Apache / Webuzo (demo.marvelslice.com, TLS 80/443)
              └─▶ 127.0.0.1:8083
                     └─▶ goldshop-web (nginx: SPA + proxy /api)
                            └─▶ goldshop-api :4000 ─▶ Supabase Cloud (Postgres)
```

The app is stateless — the only durable store is Postgres — so containers are
disposable and `docker compose up -d --build` is a full deploy.

## Files

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | `goldshop-api` + `goldshop-web` (build context = repo root) |
| `server/Dockerfile` | API image; ships `packages/` and `supabase/migrations` |
| `apps/web/Dockerfile` | Builds the Vite SPA, serves it via nginx |
| `apps/web/nginx.conf` | In-container nginx: SPA fallback + `/api` proxy |
| `deploy/apache/subdomain-vhost.conf` | Apache proxy lines for the subdomain |
| `.dockerignore` | Keeps the build context lean and secrets out |

## Ports

On your host, 80/443 (Apache), 8080/8081/8082 (`lms-nginx`), 8000/8443 (the other
stack's Supabase Kong) and 9000 (Portainer) are already taken by your other
projects. This stack binds **127.0.0.1:8083** (first free) and doesn't touch them.
Override if needed:

```bash
WEB_PORT=8090 docker compose up -d
```

Verify on the VPS before/after:

```bash
ss -tlnp | grep -E '80[0-9][0-9]|9[0-9]{3}|5[0-9]{4}|6[0-9]{4}'
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

## One-time server setup

1. DNS: `A` record for `demo.marvelslice.com` → VPS IP.
2. In Webuzo: create the subdomain, enable SSL (Let's Encrypt), then add the
   proxy lines from `deploy/apache/subdomain-vhost.conf` and reload Apache.
3. Create the env file next to `docker-compose.yml` (git-ignored, excluded from
   the image):

   ```bash
   cp .env.example .env
   $EDITOR .env
   ```

   **`DATABASE_URL`** — use your **Supabase Cloud** project's **Session pooler**
   string (Project Settings → Database → Connection string → **Session pooler**):

   ```env
   DATABASE_URL=postgresql://postgres.<project-ref>:<db-password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```

   Why the pooler: the direct host (`db.<project-ref>.supabase.co`) is **IPv6-only**,
   and most VPSes have no IPv6 — that fails with `connect ENETUNREACH`. The pooler
   is IPv4. Two things differ from the direct string: the username is
   `postgres.<project-ref>` (not `postgres`), and the host is the pooler host. Use
   **Session** mode (port **5432**), not the transaction pooler on 6543 — the API
   keeps a connection pool and runs migrations. Also set a **new** `JWT_SECRET`
   (32+ random chars) and the `SMTP_*` values.
4. Apply schema + demo data once (the API also runs migrations on boot):

   ```bash
   docker compose run --rm goldshop-api node server/src/migrate.js
   docker compose run --rm goldshop-api node server/src/seed.js
   ```

## Environment & secrets (why there's no `.env.production`)

Configuration is injected at **runtime**, not baked into images or committed as a
file. That's why there is deliberately no `.env.production`:

| Layer | File | Committed? | Used by |
| --- | --- | --- | --- |
| Template | `.env.example` | yes | reference only |
| Production | `.env` (repo root, next to compose) | **no** (gitignored) | compose `env_file` → both containers' `process.env` |
| Local dev | `server/.env` | no | `npm run dev` only |
| Frontend build | `apps/web/.env*` | n/a | build-time `VITE_*` only — we set none |

- `docker compose` reads `.env` and sets those variables in each container's
  environment. The API reads `process.env` (its `dotenv` call never overrides real
  env vars), so the server's `.env` **is** the production config.
- **For Docker, use the root `.env`** (next to `docker-compose.yml`). `server/.env`
  is for local `npm run dev` only — the container never reads it, because
  `.dockerignore` excludes it and compose is configured with `env_file: .env`
  (root). Run `docker compose` from the repo root so this file is found.
- `.env*` is listed in both `.gitignore` and `.dockerignore`, so secrets never
  reach git or the image. The image is deployment-agnostic; only the host `.env`
  changes between environments.
- A front-end `.env.production` would only matter for **build-time** `VITE_*`
  values. We leave `VITE_API_URL` unset so the SPA uses the relative `/api` and
  rides the proxy.

## Deploy / update

```bash
git pull
docker compose up -d --build
docker compose ps
docker compose logs -f goldshop-api
```

## Verify

- `curl -I https://demo.marvelslice.com/` → 200 (SPA).
- `curl https://demo.marvelslice.com/api/health` → `{"ok":true,"db":"supabase-postgres",...}`.
- `docker compose ps` shows `healthy`.

## Housekeeping

- Backups are a Postgres concern (no local DB volume): use Supabase backups or
  `pg_dump` against `DATABASE_URL`.
- Supabase Cloud free tier **pauses after ~1 week idle** — unpause from the
  dashboard, or keep the project warm for a live demo.
- Always recreate **both** containers together. The in-container nginx resolves
  `goldshop-api` once at startup; recreating `goldshop-api` alone leaves
  `goldshop-web` pointing at a stale IP (502).
- Rollback = `git checkout <previous tag> && docker compose up -d --build`.

## Troubleshooting

- **`goldshop-api` exits at boot with "Missing DATABASE_URL"** — `.env` isn't
  next to `docker-compose.yml`, or `env_file` couldn't read it.
- **`DB init failed: connect ENETUNREACH <ipv6-address>:5432`** — you're using the
  IPv6-only direct Supabase host on a VPS without IPv6. Switch `DATABASE_URL` to
  the **Session pooler** (IPv4) string; see "One-time server setup".
- **`Tenant or user not found`** — using the pooler with username `postgres`
  instead of `postgres.<project-ref>`.
- **SSL errors connecting to Postgres** — the pool hardcodes
  `ssl: { rejectUnauthorized: false }` (`server/src/db.js:41`), which is correct
  for Supabase Cloud (SSL is required). If you ever point `DATABASE_URL` at a
  local Postgres with SSL off, make that option conditional.
- **`/api` returns 502** — `goldshop-web` is pointing at a stale `goldshop-api`
  IP. Recreate both: `docker compose up -d --build`.
- **Apex/subdomain 404 from Apache** — the `ProxyPass` lines aren't in the right
  vhost, or the module (`proxy_http`) isn't enabled.
