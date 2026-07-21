#!/usr/bin/env bash
# Deploy one client instance. Uses the client's env file, runs the stack, and waits
# for the API to become healthy.
#
#   ./deploy/deploy.sh acme            # use images tagged :latest
#   ./deploy/deploy.sh acme a1b2c3d    # use a specific image tag
#
# Expects .env.<client> to exist (copy from .env.example). Images must already be
# built locally (run ./deploy/build.sh first) — there is no registry pull.
set -euo pipefail
cd "$(dirname "$0")/.."

CLIENT="${1:?usage: deploy.sh <client> [image-tag]}"
TAG="${2:-latest}"
ENV_FILE=".env.${CLIENT}"

[ -f "$ENV_FILE" ] || { echo "ERROR: $ENV_FILE not found (copy .env.example → $ENV_FILE)"; exit 1; }

# compose reads ./.env automatically for interpolation + the api env_file.
cp "$ENV_FILE" .env
export IMAGE_TAG="$TAG"

# shellcheck disable=SC1091
CONTAINER_PREFIX="$(grep -E '^CONTAINER_PREFIX=' "$ENV_FILE" | cut -d= -f2-)"
CONTAINER_PREFIX="${CONTAINER_PREFIX:-erp}"

echo "==> deploying client=${CLIENT} tag=${TAG}"
docker compose up -d

echo "==> waiting for ${CONTAINER_PREFIX}-api to become healthy…"
for i in $(seq 1 30); do
  status="$(docker inspect --format '{{.State.Health.Status}}' "${CONTAINER_PREFIX}-api" 2>/dev/null || echo starting)"
  if [ "$status" = "healthy" ]; then echo "    api healthy."; break; fi
  if [ "$status" = "unhealthy" ]; then
    echo "    api UNHEALTHY — recent logs:"; docker logs --tail 40 "${CONTAINER_PREFIX}-api" || true; exit 1
  fi
  sleep 4
done

echo
docker compose ps
echo
echo "Done. Point your host nginx for this client at 127.0.0.1:$(grep -E '^WEB_HTTP_PORT=' "$ENV_FILE" | cut -d= -f2-)"
