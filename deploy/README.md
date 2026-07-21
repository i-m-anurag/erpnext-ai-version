# Deployment

Container images + compose stack for running one or many **client instances** on a
single server that already fronts everything with an **nginx reverse proxy (TLS)**.

## Topology

```
 client.com ── TLS ──►  HOST nginx  ──►  127.0.0.1:WEB_HTTP_PORT
                                              │  (web container: nginx)
                                              ├─ serves the Angular SPA
                                              └─ /api → api container (pm2: API + worker)
                                                          │
                                              postgres ◄──┴──► redis   (containers)
```

One domain serves both the app and the API: the **web** container proxies `/api`
to the **api** container internally, so the host nginx only needs a single
`proxy_pass` per client.

## What's here

| File | Purpose |
|------|---------|
| `backend/Dockerfile` | Node API + worker under pm2 (multi-stage, prod deps only) |
| `frontend/Dockerfile` | Angular built to static, served by nginx |
| `frontend/docker/nginx.conf` | SPA routing + `/api` → api container |
| `backend/docker/ecosystem.config.cjs` | pm2 manifest (2 processes: `erp-api`, `erp-worker`) |
| `backend/docker/entrypoint.sh` | runs migrate → seed → sync:schema, then pm2 |
| `docker-compose.yml` | postgres + redis + api + web, all env-driven |
| `config/config.production.example.json` | the per-client config template (source of truth) |
| `deploy/build.sh` | build + tag images (SHA + latest); no registry push |
| `deploy/deploy.sh` | run one client stack, wait for health |
| `deploy/nginx.host.conf.example` | sample host-nginx server block |

## Config → env (single source of truth)

A client is described by ONE file: `config/config.<client>.json` (git-ignored, holds
secrets, **stays on the host — never baked into an image**). `deploy.sh` runs `gen-env`
to produce the runtime `.env` from it — the same validated pipeline dev uses. Nothing
per-client is hand-authored, so `MODULE_*` toggles and every value are derived, and a
bad/missing value fails validation before boot.

Prereq: Node deps installed once on the host (`npm ci`) so `gen-env` can run.

## First deploy (per client)

```bash
# 1. build images once (tags with git SHA + latest)
./deploy/build.sh

# 2. create the client's config (source of truth)
cp config/config.production.example.json config/config.acme.json
#    then edit config/config.acme.json — secrets + the "deploy" block:
#      deploy.composeProject / containerPrefix   (unique per client)
#      deploy.webPort                             (unique host port)
#      database.password, auth.*Secret, admin.*, smtp.*, app.publicUrl, modules.*

# 3. deploy  (generates + validates env, then brings the stack up)
./deploy/deploy.sh acme
#    → migrations + seed + schema sync run automatically on first boot

# 4. wire the host nginx (once per client)
#    copy deploy/nginx.host.conf.example → your nginx sites, set server_name,
#    certs and the client's webPort, then: nginx -t && systemctl reload nginx
```

## Multiple clients on one host

Give each client its **own** `config/config.<client>.json` with a distinct
`deploy.composeProject`, `deploy.containerPrefix`, and `deploy.webPort`. Because the
project name scopes the network + volumes and the prefix scopes container names,
nothing collides:

```bash
./deploy/deploy.sh acme      # erp-acme-*  on WEB_HTTP_PORT 8081
./deploy/deploy.sh globex    # erp-globex-* on WEB_HTTP_PORT 8082
```

Each gets its own Postgres + Redis container and named volumes, so data is fully
isolated between clients.

## Upgrades

```bash
./deploy/build.sh v1.5.0
./deploy/deploy.sh acme v1.5.0     # recreates containers; entrypoint re-runs
                                   # migrations/seed (idempotent) on the new image
```

Postgres/Redis data persists in named volumes across upgrades. `gl_entry` is
append-only — migrations never rewrite posted history.

## Notes

- **Health:** the api exposes `/healthz` (liveness) and `/readyz` (DB+Redis
  readiness); both the Docker healthcheck and `deploy.sh` use them.
- **Posting rules** load from `seed-data/` at container startup — a new container
  (every deploy) picks them up automatically. No separate step.
- **ECR:** push is intentionally omitted for now. `build.sh` already tags a SHA;
  the commented block at the bottom of `build.sh` is the push step for later.
- **Secrets:** `config/config.<client>.json` (and the generated `.env`) are
  git-ignored — keep them on the server / in your secrets manager, never in the repo
  or an image.
