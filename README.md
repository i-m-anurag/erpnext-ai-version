# White-Label ERP

Configurable ERP for inventory & account management. One product, many **dedicated
deployments** — same codebase/images ship to every client; each client runs its own
isolated stack (own Postgres, Redis, containers, branding). Everything that varies per
client is **configuration, not code**.

Stack: **Node.js / Express** (modular monolith) · **PostgreSQL** + **TypeORM** ·
**Redis** · **Zod** · **Docker**. Angular 20 frontend lands in a later phase.

> Build is phased (see the implementation doc). **Phase 1 = backend only.**

## Repo layout

```
config/        per-env config JSON (single source of truth, incl. secrets) + Zod schema
scripts/       gen-env.ts — turns config JSON into backend/.env
backend/       Express modular monolith (TypeScript)
  src/config/  env loading + logger
  src/db/      TypeORM data-source, migrations, seeds, redis client
  src/shared/  BaseRepository, errors, middleware
  src/modules/ feature modules (auth, permission, …) — added as phases land
docker/        docker-compose.dev.yml (Postgres + Redis + Mailhog)
```

## Prerequisites

- Node.js ≥ 22, npm ≥ 10
- Docker Desktop (for the local Postgres/Redis/Mailhog stack)

## First-time setup

```bash
npm install

# 1. Create your real dev config from the template (git-ignored; holds secrets)
cp config/config.dev.example.json config/config.dev.json

# 2. Generate backend/.env from the JSON config
npm run gen:env -- dev

# 3. Start local infrastructure (Postgres :55432, Redis :6380, Mailhog :8025)
npm run db:up

# 4. Apply database migrations
npm run migration:run

# 5. Seed base data (idempotent): permission catalog, system roles (admin/viewer),
#    master registry, base form definitions, and the first admin user.
npm run seed

# 6. Run the API in watch mode
npm run dev      # http://localhost:3000
```

The seeder bootstraps the first **admin** user from `config.<env>.json` → `admin.*`
and emails a one-time set-password link (visible in Mailhog at http://localhost:8025 in
dev). Open it, set a password, then log in via `POST /api/auth/login`.

### Tests (Vitest)

```bash
npm run test:unit --workspace backend         # pure logic — no infrastructure
npm run test:integration --workspace backend  # needs Docker up + migrate + seed
npm run test --workspace backend              # both
npm run test:watch --workspace backend        # watch mode
```

- **Unit** specs (`*.spec.ts`): deep-merge, form validation, email rendering, token
  service, password hashing, permission guard.
- **Integration** specs (`*.int.spec.ts`): config-resolution pipeline, auth lifecycle
  (incl. refresh-token reuse detection), ACL + live propagation, seeders, master-data
  store — run against the live Postgres/Redis/Mailhog stack.

Verify: `curl localhost:3000/readyz` → `{"status":"ready","checks":{"db":"ok","redis":"ok"}}`.
Mailhog UI: http://localhost:8025.

**API docs:** interactive Swagger UI at http://localhost:3000/docs, raw OpenAPI spec at
http://localhost:3000/openapi.json. The spec is generated from the same Zod schemas that
validate requests, so it never drifts from the implementation.

> Local dev ports are remapped (Postgres 55432, Redis 6380) so they don't clash with a
> Postgres/Redis you may already run natively on the default ports.

## Configuration → env

`config/config.<env>.json` is the **only** place you edit configuration. It holds all
settings for a deployment, including secrets (per project decision), validated by
`config/schema.ts` (Zod). The real `config.*.json` files are git-ignored; only
`*.example.json` templates are committed.

`scripts/gen-env.ts` validates a config file and flattens it into `backend/.env`. **Never
hand-edit `.env`** — change the JSON and regenerate:

```bash
npm run gen:env -- dev        # or staging / production
```

The backend reads the generated `.env` back through `backend/src/config/env.ts` (also
Zod-validated at boot), so a misconfiguration fails fast with a clear message.

## Common commands

| Command | What it does |
|---|---|
| `npm run dev` | API in watch mode (tsx) |
| `npm run build` | Type-check + compile backend to `dist/` |
| `npm run gen:env -- <env>` | Regenerate `.env` from `config/config.<env>.json` |
| `npm run db:up` / `db:down` / `db:logs` | Manage local infra containers |
| `npm run migration:generate -- src/db/migrations/<Name>` | Generate a migration from entity changes |
| `npm run migration:run` / `migration:revert` | Apply / undo migrations |
| `npm run seed` | Run idempotent base-data seeders |
| `npm run lint` / `npm run format` | ESLint / Prettier |

## Database & schema

Schema is **migration-driven** — `synchronize` is always off (a persistent volume +
synchronize can silently drop columns). After changing an entity, generate a migration,
review it, and run it. Base seed data is idempotent so it can be re-applied on upgrade
without disturbing client overrides.
