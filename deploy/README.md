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
| `.env.example` | the per-client env contract |
| `deploy/build.sh` | build + tag images (SHA + latest); no registry push |
| `deploy/deploy.sh` | run one client stack, wait for health |
| `deploy/nginx.host.conf.example` | sample host-nginx server block |

## First deploy (per client)

```bash
# 1. build images once (tags with git SHA + latest)
./deploy/build.sh

# 2. create the client's env file
cp .env.example .env.acme
#    then edit .env.acme — at minimum:
#      CLIENT_SLUG, COMPOSE_PROJECT_NAME, CONTAINER_PREFIX  (all unique)
#      WEB_HTTP_PORT                                        (unique host port)
#      DB_PASSWORD, DB_NAME, AUTH_*_SECRET, ADMIN_*, SMTP_*, APP_PUBLIC_URL

# 3. deploy
./deploy/deploy.sh acme
#    → migrations + seed + schema sync run automatically on first boot

# 4. wire the host nginx (once per client)
#    copy deploy/nginx.host.conf.example → your nginx sites, set server_name,
#    certs and WEB_HTTP_PORT, then: nginx -t && systemctl reload nginx
```

## Multiple clients on one host

Give each client its **own** `.env.<client>` with distinct
`COMPOSE_PROJECT_NAME`, `CONTAINER_PREFIX`, and `WEB_HTTP_PORT`. Because the
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
- **Secrets:** `.env.<client>` files are git-ignored — keep them on the server /
  in your secrets manager, never in the repo.
