#!/usr/bin/env bash
# Build + tag the backend and frontend images locally. No registry push (by design,
# for now). Tags each image with a version (git short SHA by default) AND :latest —
# the SHA tag is what you'd later push to ECR.
#
#   ./deploy/build.sh                 # tag = current git short SHA
#   ./deploy/build.sh v1.4.0          # tag = v1.4.0
#   IMAGE_BACKEND=myco-erp-be ./deploy/build.sh   # override image names
set -euo pipefail
cd "$(dirname "$0")/.."

TAG="${1:-$(git rev-parse --short HEAD 2>/dev/null || echo latest)}"
BE="${IMAGE_BACKEND:-erp-backend}"
FE="${IMAGE_FRONTEND:-erp-frontend}"

echo "==> backend  ${BE}:${TAG} (+ :latest)   [context: repo root]"
docker build -f backend/Dockerfile -t "${BE}:${TAG}" -t "${BE}:latest" .

echo "==> frontend ${FE}:${TAG} (+ :latest)   [context: frontend/]"
docker build -f frontend/Dockerfile -t "${FE}:${TAG}" -t "${FE}:latest" frontend

echo
echo "Built and tagged:"
echo "  ${BE}:${TAG}   ${BE}:latest"
echo "  ${FE}:${TAG}   ${FE}:latest"
echo
echo "Deploy with:  ./deploy/deploy.sh <client> ${TAG}"
# ── ECR push (intentionally omitted for now) ─────────────────────────────────
# When ready:
#   aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"
#   docker tag "${BE}:${TAG}" "$ECR_REGISTRY/${BE}:${TAG}" && docker push "$ECR_REGISTRY/${BE}:${TAG}"
#   docker tag "${FE}:${TAG}" "$ECR_REGISTRY/${FE}:${TAG}" && docker push "$ECR_REGISTRY/${FE}:${TAG}"
