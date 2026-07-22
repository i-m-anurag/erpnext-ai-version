#!/bin/sh
# Backend container entrypoint. Provisions the database (idempotent) before handing
# off to pm2. `depends_on: service_healthy` already waits for Postgres/Redis, so by
# the time this runs the DB is reachable.
#
#   MIGRATE_ON_START=false  → skip provisioning (e.g. a read-only replica)
set -e

if [ "${MIGRATE_ON_START:-true}" = "true" ]; then
  echo "[entrypoint] running migrations…"
  node dist/db/typeorm-cli.js migration:run -d dist/db/data-source.js

  echo "[entrypoint] seeding reference data…"
  node dist/db/seeds/run-seeds.js

  echo "[entrypoint] syncing document schema…"
  node dist/db/sync-schema.js
else
  echo "[entrypoint] MIGRATE_ON_START=false — skipping DB provisioning"
fi

echo "[entrypoint] starting: $*"
exec "$@"
