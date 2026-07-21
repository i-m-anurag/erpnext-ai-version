# Frontend image — Angular built to static files, served by nginx.
# Build context is the frontend/ folder:  docker build -f frontend/Dockerfile -t erp-frontend frontend
# syntax=docker/dockerfile:1

# ── build stage ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# @angular/build:application → static site under dist/frontend/browser
RUN npm run build

# ── runtime stage ──────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/frontend/browser /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -qO- http://localhost:80/ >/dev/null 2>&1 || exit 1
