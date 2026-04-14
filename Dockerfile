# Brigade Electronics — Vehicle Onboarding (Lean Edition)
# Multi-stage build: keeps the final image small and clean.

# ── Stage 1: install dependencies (needs build tools for better-sqlite3) ───────
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 2: runtime image ─────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Non-root user (security hardening)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Persistent storage folders — mount these as volumes in production
# so data survives container restarts.
RUN mkdir -p uploads data logs && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
