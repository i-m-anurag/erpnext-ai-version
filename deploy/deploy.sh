#!/usr/bin/env bash
# Deploy one client instance.
#
# The env is GENERATED from config/config.<client>.json via gen-env (validated
# against config/schema.ts) — never hand-authored. This is the same config→env
# pipeline dev uses, so MODULE_* toggles and every value are derived, not typed.
#
#   ./deploy/deploy.sh acme            # tag from config.deploy.imageTag
#   ./deploy/deploy.sh acme a1b2c3d    # override the image tag
#
# Prereqs on the host:
#   • config/config.<client>.json exists (copy config/config.production.example.json,
#     fill in secrets + the deploy block). It stays on the host — never in an image.
#   • Node deps installed once (npm ci) so gen-env can run.
#   • Images already built locally (./deploy/build.sh).
set -euo pipefail
cd "$(dirname "$0")/.."

CLIENT="${1:?usage: deploy.sh <client> [image-tag]}"
TAG_OVERRIDE="${2:-}"
CONFIG="config/config.${CLIENT}.json"

[ -f "$CONFIG" ] || {
  echo "ERROR: $CONFIG not found."
  echo "       cp config/config.production.example.json $CONFIG   # then edit secrets + deploy block"
  exit 1
}

echo "==> generating env from ${CONFIG} (validated)…"
npm run gen:env -- "$CLIENT"          # writes backend/.env
cp backend/.env .env                   # compose reads ./.env (interpolation + api env_file)

# Optional CLI tag override wins over config.deploy.imageTag.
[ -n "$TAG_OVERRIDE" ] && { export IMAGE_TAG="$TAG_OVERRIDE"; echo "==> image tag override: $IMAGE_TAG"; }

PREFIX="$(grep -E '^CONTAINER_PREFIX=' .env | cut -d= -f2- | tr -d '"')"
PREFIX="${PREFIX:-erp}"

echo "==> deploying client=${CLIENT}"
docker compose up -d

echo "==> waiting for ${PREFIX}-api to become healthy…"
for _ in $(seq 1 30); do
  status="$(docker inspect --format '{{.State.Health.Status}}' "${PREFIX}-api" 2>/dev/null || echo starting)"
  [ "$status" = "healthy" ] && { echo "    api healthy."; break; }
  [ "$status" = "unhealthy" ] && { echo "    api UNHEALTHY — logs:"; docker logs --tail 40 "${PREFIX}-api" || true; exit 1; }
  sleep 4
done

echo
docker compose ps
echo
echo "Done. Point the host nginx for this client at 127.0.0.1:$(grep -E '^WEB_HTTP_PORT=' .env | cut -d= -f2- | tr -d '"')"
