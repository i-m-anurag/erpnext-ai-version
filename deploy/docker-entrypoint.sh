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

# Sync the asset manifest with THIS image's build. The sites volume persists
# across image rebuilds and can hold a stale assets.json (old bundle hashes),
# which 404s the CSS/JS. Restoring the image's snapshot keeps them in sync.
if [ -d /home/frappe/assets-image ]; then
  echo "[entrypoint] Syncing asset manifest with image (prevents stale-volume 404s)..."
  rm -rf sites/assets
  cp -a /home/frappe/assets-image sites/assets
  # Flush the cache redis so it can't serve a stale asset->hash mapping cached
  # from a previous image build (cache-only redis; queue redis is separate).
  redis-cli -u "redis://$REDIS_CACHE" flushall >/dev/null 2>&1 || true
fi

if [ ! -d "sites/$SITE_NAME" ]; then
  echo "[entrypoint] Creating site $SITE_NAME ..."
  bench new-site "$SITE_NAME" \
    --db-host "$DB_HOSTNAME" \
    --mariadb-root-password "$DB_ROOT_PASSWORD" \
    --admin-password "$ADMIN_PASSWORD" \
    --mariadb-user-host-login-scope='%'

  echo "[entrypoint] Installing erpnext (needed early for the v16 fix) ..."
  bench --site "$SITE_NAME" install-app erpnext

  # Known v16 fix: programmatic Address/Contact custom fields
  # (avoids the missing 'is_billing_contact' column we hit earlier)
  bench --site "$SITE_NAME" execute \
    erpnext.setup.install.create_address_and_contact_custom_fields || true

  bench use "$SITE_NAME"
else
  echo "[entrypoint] Site $SITE_NAME already exists, skipping creation."
fi

# ---------------------------------------------------------------------------
# Ensure every bundled app is registered in apps.txt and installed on the site.
# This is NON-DESTRUCTIVE: it installs apps added via an image rebuild into the
# EXISTING site (preserving all data/settings) — so you never need `down -v`.
# Order matters (erpnext -> hrms/india_compliance -> custom app last).
# ---------------------------------------------------------------------------
for app in erpnext hrms india_compliance ai_procurement; do
  [ -d "apps/$app" ] || continue
  grep -qxF "$app" sites/apps.txt 2>/dev/null \
    || printf '%s\n' "$(cat sites/apps.txt)" "$app" > sites/apps.txt
  if ! bench --site "$SITE_NAME" list-apps 2>/dev/null | awk '{print $1}' | grep -qxF "$app"; then
    echo "[entrypoint] Installing newly-added app into existing site: $app"
    bench --site "$SITE_NAME" install-app "$app" || echo "[entrypoint] WARN: install-app $app failed (continuing)"
  fi
done

echo "[entrypoint] Running migrations..."
bench --site "$SITE_NAME" migrate

# Email routing — fully env-driven. Always set from env (empty = disabled), so
# removing the env var turns it off on the next restart.
#   EMAIL_COPY_TO     -> approver AND this address both receive every email
#   EMAIL_REDIRECT_TO -> ONLY this address receives email (testing)
bench --site "$SITE_NAME" set-config email_copy_to "${EMAIL_COPY_TO:-}"
bench --site "$SITE_NAME" set-config email_redirect_to "${EMAIL_REDIRECT_TO:-}"

case "$1" in
  start)
    echo "[entrypoint] Starting bench processes..."
    exec bench start
    ;;
  *)
    exec "$@"
    ;;
esac
