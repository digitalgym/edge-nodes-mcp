#!/usr/bin/env bash
set -euo pipefail

# Edge Nodes MCP — One-Click Deploy
# Usage: ./deploy.sh [--preview]

PREVIEW=""
if [[ "${1:-}" == "--preview" ]]; then
  PREVIEW="--preview"
  echo ">> Deploying PREVIEW..."
else
  echo ">> Deploying to PRODUCTION..."
fi

# 1) Install deps
echo ">> Installing dependencies..."
npm ci

# 2) Type-check
echo ">> Type-checking..."
npx tsc --noEmit

# 3) Regenerate registry (in case new nodes were added)
echo ">> Regenerating node registry..."
npx tsx mcp/src/generate-registry.ts

# 4) Deploy to Vercel
echo ">> Deploying to Vercel..."
if [[ -n "$PREVIEW" ]]; then
  npx vercel $PREVIEW
else
  npx vercel --prod
fi

echo ""
echo ">> Done! MCP endpoint: <your-vercel-url>/api/mcp/sse"
echo ">> Direct node execution: <your-vercel-url>/api/node?name=<node-name>"
