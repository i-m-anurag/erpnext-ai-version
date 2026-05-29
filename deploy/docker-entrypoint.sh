#!/bin/bash
# ============================================================================
# Runtime entrypoint for the ERPNext + AI Procurement all-in-one container.
# Order: configure -> wait for services -> create site (once) -> migrate -> run
# ============================================================================
set -e

cd /home/frappe/frappe-bench

: "${SITE_NAME:?SITE_NAME env is required}"
: "${DB_HOST:?DB_HOST env is required (host:port)}"
: "${DB_ROOT_PASSWORD:?DB_ROOT_PASSWORD env is required}"
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD env is required}"
: "${REDIS_CACHE:?REDIS_CACHE env is required (host:port)}"
: "${REDIS_QUEUE:?REDIS_QUEUE env is required (host:port)}"

DB_HOSTNAME="${DB_HOST%%:*}"

echo "[entrypoint] Writing common_site_config..."
bench set-config -g db_host "$DB_HOSTNAME"
bench set-config -gp db_port "${DB_HOST##*:}"
bench set-config -g redis_cache "redis://$REDIS_CACHE"
bench set-config -g redis_queue "redis://$REDIS_QUEUE"
bench set-config -g redis_socketio "redis://$REDIS_QUEUE"
bench set-config -gp socketio_port 9000

echo "[entrypoint] Waiting for MariaDB at $DB_HOSTNAME..."
until mysqladmin ping -h "$DB_HOSTNAME" --silent; do
  sleep 2
done

echo "[entrypoint] Waiting for Redis at $REDIS_CACHE..."
until redis-cli -u "redis://$REDIS_CACHE" ping >/dev/null 2>&1; do
  sleep 2
done

if [ ! -d "sites/$SITE_NAME" ]; then
  echo "[entrypoint] Creating site $SITE_NAME ..."
  bench new-site "$SITE_NAME" \
    --db-host "$DB_HOSTNAME" \
    --mariadb-root-password "$DB_ROOT_PASSWORD" \
    --admin-password "$ADMIN_PASSWORD" \
    --mariadb-user-host-login-scope='%'

  echo "[entrypoint] Installing apps (erpnext, ai_procurement) ..."
  bench --site "$SITE_NAME" install-app erpnext
  bench --site "$SITE_NAME" install-app ai_procurement

  # Known v16 fix: programmatic Address/Contact custom fields
  # (avoids the missing 'is_billing_contact' column we hit earlier)
  bench --site "$SITE_NAME" execute \
    erpnext.setup.install.create_address_and_contact_custom_fields || true

  bench use "$SITE_NAME"
else
  echo "[entrypoint] Site $SITE_NAME already exists, skipping creation."
fi

echo "[entrypoint] Running migrations..."
bench --site "$SITE_NAME" migrate

case "$1" in
  start)
    echo "[entrypoint] Starting bench processes..."
    exec bench start
    ;;
  *)
    exec "$@"
    ;;
esac
