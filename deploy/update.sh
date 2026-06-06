#!/usr/bin/env bash
#
# Safe, one-command deploy/update for the ERPNext + Collatio Docker stack.
# Runs: backup (to host) -> git pull -> build -> up -d -> verify.
# Data/settings are preserved (no volumes are removed).
#
# Usage:
#   ./update.sh            # interactive (asks for confirmation)
#   ./update.sh -y         # skip the confirmation prompt
#
set -euo pipefail

cd "$(dirname "$0")"                 # -> the deploy/ directory
REPO_ROOT="$(cd .. && pwd)"
STAMP="$(date +%Y%m%d_%H%M%S)"
HOST_BACKUP_DIR="./backups/$STAMP"

# Resolve the site name from .env
if [ ! -f .env ]; then
  echo "ERROR: .env not found in $(pwd). Copy .env.example to .env first." >&2
  exit 1
fi
SITE_NAME="$(grep -E '^SITE_NAME=' .env | head -1 | cut -d= -f2- | tr -d '[:space:]')"
[ -n "$SITE_NAME" ] || { echo "ERROR: SITE_NAME not set in .env" >&2; exit 1; }

AUTO_YES="no"
[ "${1:-}" = "-y" ] || [ "${1:-}" = "--yes" ] && AUTO_YES="yes"

echo "=================================================="
echo " Deploy update for site: $SITE_NAME"
echo " Steps: backup -> git pull -> build -> up -> verify"
echo " (volumes are preserved; data is NOT wiped)"
echo "=================================================="
if [ "$AUTO_YES" != "yes" ]; then
  read -r -p "Proceed? [y/N] " ans
  case "$ans" in [yY]|[yY][eE][sS]) ;; *) echo "Aborted."; exit 0 ;; esac
fi

# ---------------------------------------------------------------- 1. BACKUP
echo ""
echo "[1/5] Backing up site (DB + files)..."
if docker compose ps -q app >/dev/null 2>&1 && [ -n "$(docker compose ps -q app)" ]; then
  docker compose exec -T app bench --site "$SITE_NAME" backup --with-files
  echo "      Copying backup to host: $HOST_BACKUP_DIR"
  mkdir -p "$HOST_BACKUP_DIR"
  docker cp "$(docker compose ps -q app):/home/frappe/frappe-bench/sites/$SITE_NAME/private/backups/." "$HOST_BACKUP_DIR/"
  echo "      Backup saved to $HOST_BACKUP_DIR"
else
  echo "      App container not running yet — skipping backup (first deploy)."
fi

# ---------------------------------------------------------------- 2. PULL
echo ""
echo "[2/5] Pulling latest code..."
git -C "$REPO_ROOT" pull --ff-only

# ---------------------------------------------------------------- 3. BUILD
echo ""
echo "[3/5] Building image (first build can take ~15-20 min)..."
docker compose build

# ---------------------------------------------------------------- 4. UP
echo ""
echo "[4/5] Applying — recreating containers (migrations + app installs run on start)..."
docker compose up -d

# ---------------------------------------------------------------- 5. VERIFY
echo ""
echo "[5/5] Waiting for the site to come online..."
tries=0
until docker compose exec -T app curl -fsS -o /dev/null http://localhost:8000/api/method/ping 2>/dev/null; do
  tries=$((tries + 1))
  if [ "$tries" -gt 120 ]; then
    echo "      Still not up after ~10 min. Check: docker compose logs -f app" >&2
    exit 1
  fi
  sleep 5
done

echo ""
echo "=================================================="
echo " Deploy complete. Site is up."
echo " Installed apps:"
docker compose exec -T app bench --site "$SITE_NAME" list-apps 2>/dev/null | sed 's/^/   /'
echo " Backup of the previous state: $HOST_BACKUP_DIR"
echo "=================================================="
