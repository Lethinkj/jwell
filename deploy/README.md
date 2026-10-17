# Deploy (Docker Compose + Apache/Webuzo)

Two containers, one published loopback port. **Apache (Webuzo)** on the host owns
ports 80/443 and TLS; it reverse-proxies to the web container.

```
Internet ─▶ Apache / Webuzo (demo.marvelslice.com, TLS 80/443)
              └─▶ 127.0.0.1:8083
                     └─▶ goldshop-web (nginx: SPA + proxy /api)
                            └─▶ goldshop-api :4000 ─▶ Supabase Postgres
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

Your host already uses 80/443 (Apache), 8080/8081/8082 (docker `lms-nginx`,
landing/LMS/pgAdmin), 8000/8443 (Supabase Kong), 9000 (Portainer),
54329/65439 (Supabase Postgres/pooler).

This stack therefore binds **127.0.0.1:8083** (first free). Override if needed:

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

   **`DATABASE_URL`** — you run Supabase **self-hosted** on this VPS. The robust
   link is to put the API container on Supabase's Docker network and address
   Postgres by its **service name** on the internal port (5432), not the
   host-published 54329:

   ```env
   DATABASE_URL=postgresql://postgres:<pw>@db:5432/goldshop
   ```

   See "Connecting to your self-hosted Supabase" below for the network override.
   Create a **dedicated database** (e.g. `goldshop`) — the migrations create plain
   tables in `public` and would collide with the landing project if you shared its
   database. Set a **new** `JWT_SECRET` (32+ random chars).
4. Apply schema + demo data once (the API also runs migrations on boot):

   ```bash
   docker compose run --rm goldshop-api node server/src/migrate.js
   docker compose run --rm goldshop-api node server/src/seed.js
   ```

## Connecting to your self-hosted Supabase

The API needs TCP access to Postgres. Your `ss` output shows it published on
**`127.0.0.1:54329`** — loopback only. A container cannot reach a loopback bind
through `host.docker.internal` (that resolves to the docker *gateway* IP, not
`127.0.0.1`). So prefer option A.

### A. Join Supabase's Docker network (recommended)

Put the API on the same network as Supabase's Postgres and address it by service
name. Create `docker-compose.override.yml` next to `docker-compose.yml`:

```yaml
services:
  goldshop-api:
    networks:
      - app
      - supabase
networks:
  supabase:
    external: true
    name: SUPABASE_NETWORK   # <- from the commands below
```

Find the network name and the Postgres service/container name:

```bash
docker network ls
docker ps --format '{{.Names}}\t{{.Networks}}' | grep -i -E 'supabase|postgres'
docker inspect <supabase-db-container> \
  --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

Then set, using the **service name** shown in that network:

```env
DATABASE_URL=postgresql://postgres:<pw>@db:5432/goldshop
```

(Create the `goldshop` database first — e.g. `docker exec -it <db> psql -U postgres -c 'CREATE DATABASE goldshop;'`.)

### B. Reach it via the host gateway

Only works if the port is bound to a **non-loopback** address. With Postgres on
`127.0.0.1:54329` this fails with `ECONNREFUSED` — use A. If you later rebind it
to `0.0.0.0`/the docker bridge, then:

```env
DATABASE_URL=postgresql://postgres:<pw>@host.docker.internal:54329/goldshop
```

(`extra_hosts: host.docker.internal:host-gateway` is already set on `goldshop-api`.)

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
- Self-hosted Supabase doesn't pause (that's a Cloud free-tier thing), but it's
  now a hard dependency: keep its containers up and its Postgres backups healthy.
- Always recreate **both** containers together. The in-container nginx resolves
  `goldshop-api` once at startup; recreating `goldshop-api` alone leaves
  `goldshop-web` pointing at a stale IP (502).
- Rollback = `git checkout <previous tag> && docker compose up -d --build`.

## Troubleshooting

- **`goldshop-api` exits at boot with "Missing DATABASE_URL"** — `.env` isn't
  next to `docker-compose.yml`, or `env_file` couldn't read it.
- **SSL / "server does not support SSL" errors connecting to Postgres** — the
  API's pool hardcodes `ssl: { rejectUnauthorized: false }`
  (`server/src/db.js:41`). Supabase Cloud always wants SSL so this is correct
  there; a self-hosted Postgres that has SSL disabled on 54329 will reject it.
  Either enable SSL on the Supabase Postgres, or make the `ssl` option
  conditional on the host.
- **`/api` returns 502** — `goldshop-web` is pointing at a stale `goldshop-api`
  IP. Recreate both: `docker compose up -d --build`.
- **Apex/subdomain 404 from Apache** — the `ProxyPass` lines aren't in the right
  vhost, or the module (`proxy_http`) isn't enabled.
