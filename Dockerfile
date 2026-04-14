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

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Ensure storage folders exist (volumes mounted here will override at runtime)
RUN mkdir -p uploads data logs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
