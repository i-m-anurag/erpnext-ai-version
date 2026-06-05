#!/usr/bin/env bash
#
# One-command dev bootstrap for the white-label ERP.
#
#   ./start.sh                  # full setup + run backend + frontend
#   ./start.sh --skip-seed      # skip seeding (e.g. on a warm DB)
#   ./start.sh --down           # stop the docker infra and exit
#
# Steps: ensure deps → start docker (postgres/redis/mailhog) → generate .env from
# config → run migrations → seed → start Node (backend) and Angular (frontend).
#
# Options:
#   --env <name>            config env to use (default: dev)
#   --frontend-port <n>     Angular dev-server port (default: 4200)
#   --skip-install          don't run npm install
#   --skip-migrate          don't run migrations
#   --skip-seed             don't run seeders
#   --down                  docker compose down (stop infra) and exit
#   -h, --help              show this help
#
set -euo pipefail

# ── Resolve repo root (this script's directory) ──────────────────────────────
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# ── Config / args ────────────────────────────────────────────────────────────
ENV_NAME="dev"
FRONTEND_PORT="4200"
DO_INSTALL=1
DO_MIGRATE=1
DO_SEED=1
DO_DOWN=0
COMPOSE_FILE="docker/docker-compose.dev.yml"
PG_CONTAINER="erp-dev-postgres"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENV_NAME="$2"; shift 2 ;;
    --frontend-port) FRONTEND_PORT="$2"; shift 2 ;;
    --skip-install) DO_INSTALL=0; shift ;;
    --skip-migrate) DO_MIGRATE=0; shift ;;
    --skip-seed) DO_SEED=0; shift ;;
    --down) DO_DOWN=1; shift ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# ── Pretty logging ───────────────────────────────────────────────────────────
c_blue=$'\033[34m'; c_green=$'\033[32m'; c_yellow=$'\033[33m'; c_red=$'\033[31m'; c_reset=$'\033[0m'
step() { echo "${c_blue}▶ $*${c_reset}"; }
ok()   { echo "${c_green}✓ $*${c_reset}"; }
warn() { echo "${c_yellow}! $*${c_reset}"; }
die()  { echo "${c_red}✗ $*${c_reset}" >&2; exit 1; }

# ── Prerequisites ────────────────────────────────────────────────────────────
command -v node >/dev/null || die "node is not installed"
command -v npm  >/dev/null || die "npm is not installed"
command -v docker >/dev/null || die "docker is not installed"

# ── --down: stop infra and exit ──────────────────────────────────────────────
if [[ "$DO_DOWN" == "1" ]]; then
  step "Stopping docker infra"
  docker compose -f "$COMPOSE_FILE" down
  ok "infra stopped"
  exit 0
fi

# ── 1. Ensure Docker daemon is running ───────────────────────────────────────
step "Checking Docker daemon"
if ! docker info >/dev/null 2>&1; then
  if [[ "$(uname)" == "Darwin" ]]; then
    warn "Docker not running — launching Docker Desktop…"
    open -a Docker || die "could not launch Docker Desktop"
    for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 2; done
  fi
  docker info >/dev/null 2>&1 || die "Docker daemon is not running"
fi
ok "Docker is running"

# ── 2. Dependencies ──────────────────────────────────────────────────────────
if [[ "$DO_INSTALL" == "1" ]]; then
  if [[ ! -d node_modules || ! -d backend/node_modules ]]; then
    step "Installing root + backend dependencies"; npm install
  fi
  if [[ ! -d frontend/node_modules ]]; then
    step "Installing frontend dependencies"; npm --prefix frontend install
  fi
  ok "dependencies ready"
else
  warn "skipping npm install"
fi

# ── 3. Config → .env ─────────────────────────────────────────────────────────
CONFIG_FILE="config/config.${ENV_NAME}.json"
if [[ ! -f "$CONFIG_FILE" ]]; then
  if [[ -f "config/config.${ENV_NAME}.example.json" ]]; then
    warn "$CONFIG_FILE missing — copying from example (edit secrets as needed)"
    cp "config/config.${ENV_NAME}.example.json" "$CONFIG_FILE"
  else
    die "$CONFIG_FILE not found and no example to copy"
  fi
fi
step "Generating backend/.env from $CONFIG_FILE"
npm run gen:env -- "$ENV_NAME" >/dev/null
ok ".env generated"

BACKEND_PORT="$(grep -E '^APP_PORT=' backend/.env | cut -d= -f2 | tr -d '"' || true)"
BACKEND_PORT="${BACKEND_PORT:-3000}"

# ── 4. Start docker infra (postgres/redis/mailhog) ───────────────────────────
step "Starting docker infra (postgres, redis, mailhog)"
docker compose -f "$COMPOSE_FILE" up -d
step "Waiting for Postgres to be healthy"
for _ in $(seq 1 30); do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$PG_CONTAINER" 2>/dev/null || echo starting)"
  [[ "$status" == "healthy" ]] && break
  sleep 2
done
[[ "$(docker inspect -f '{{.State.Health.Status}}' "$PG_CONTAINER" 2>/dev/null)" == "healthy" ]] \
  || die "Postgres did not become healthy in time"
ok "infra up (postgres healthy)"

# ── 5. Migrations ────────────────────────────────────────────────────────────
if [[ "$DO_MIGRATE" == "1" ]]; then
  step "Running database migrations"
  npm run migration:run >/dev/null
  ok "migrations applied"
else
  warn "skipping migrations"
fi

# ── 6. Seed ──────────────────────────────────────────────────────────────────
if [[ "$DO_SEED" == "1" ]]; then
  step "Seeding base data (+ active client overrides)"
  npm run seed >/dev/null
  ok "seed complete"
else
  warn "skipping seed"
fi

# ── 7. Run backend + frontend ────────────────────────────────────────────────
BACK_PID=""; FRONT_PID=""
cleanup() {
  echo
  step "Shutting down dev servers"
  [[ -n "$BACK_PID" ]] && kill "$BACK_PID" 2>/dev/null || true
  [[ -n "$FRONT_PID" ]] && kill "$FRONT_PID" 2>/dev/null || true
  pkill -f "tsx watch src/main.ts" 2>/dev/null || true
  pkill -f "@angular/build:dev-server" 2>/dev/null || true
  ok "stopped (docker infra left running — use './start.sh --down' to stop it)"
}
trap cleanup EXIT INT TERM

echo
ok "Setup complete. Starting servers…"
echo "    Backend  : http://localhost:${BACKEND_PORT}      (API, Swagger at /docs)"
echo "    Frontend : http://localhost:${FRONTEND_PORT}      (proxies /api → backend)"
echo "    Mailhog  : http://localhost:8025"
echo "    Press Ctrl+C to stop both servers."
echo

( cd backend && npm run dev ) & BACK_PID=$!
( cd frontend && npm start -- --port "$FRONTEND_PORT" ) & FRONT_PID=$!

# Keep the script alive while both servers run. `wait` (no -n) is bash-3.2 safe
# (macOS ships bash 3.2); Ctrl+C triggers the cleanup trap to stop both.
wait
