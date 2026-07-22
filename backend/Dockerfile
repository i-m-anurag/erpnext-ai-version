# Backend image — Node API + background worker under pm2.
# BUILD CONTEXT MUST BE THE REPO ROOT (backend is an npm workspace; the lockfile
# lives at the root):  docker build -f backend/Dockerfile -t erp-backend .
# syntax=docker/dockerfile:1

# ── build stage ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
# Install with the root lockfile so the workspace resolves reproducibly.
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
RUN npm ci
# backend/tsconfig.json extends this root config (decorator options live there).
COPY tsconfig.base.json ./
COPY backend ./backend
RUN npm run build --workspace @erp/backend
# Drop dev dependencies from the shared node_modules — runtime uses compiled dist,
# never tsx/ts-node.
RUN npm prune --omit=dev

# ── runtime stage ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app/backend
RUN npm install -g pm2

# Hoisted deps live at the workspace root; dist resolves up into them.
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/package.json ./package.json
# seed-data is read at runtime (seeders + posting rules). Config is env-only in prod.
COPY backend/seed-data ./seed-data
COPY backend/docker/ecosystem.config.cjs ./ecosystem.config.cjs
COPY backend/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3100
# Liveness/readiness are served by the app (/healthz, /readyz).
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=10 \
  CMD wget -qO- http://localhost:3100/readyz >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["pm2-runtime", "ecosystem.config.cjs"]
