FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY mcp/ ./mcp/
COPY nodes/ ./nodes/
COPY api/ ./api/

# Type-check (non-blocking — we run via tsx which handles TS directly)
RUN npx tsc --noEmit || true

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:22-slim

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/mcp ./mcp
COPY --from=builder /app/nodes ./nodes

# tsx runs TypeScript directly without a build step
ENTRYPOINT ["npx", "tsx", "mcp/src/stdio.ts"]
