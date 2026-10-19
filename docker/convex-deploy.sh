#!/bin/sh
# Sets the backend env vars that convex/auth.config.ts reads, then deploys.
set -e

if [ -z "$CONVEX_SELF_HOSTED_ADMIN_KEY" ]; then
  echo "CONVEX_SELF_HOSTED_ADMIN_KEY is not set; skipping Convex deploy."
  echo "Generate one with: docker exec <convex container> ./generate_admin_key.sh"
  exit 0
fi

: "${CONVEX_SELF_HOSTED_URL:?CONVEX_SELF_HOSTED_URL is required}"
: "${LOGTO_ENDPOINT:?LOGTO_ENDPOINT is required}"
: "${LOGTO_APP_ID:?LOGTO_APP_ID is required}"

npx convex env set LOGTO_ENDPOINT "$LOGTO_ENDPOINT" --force
npx convex env set LOGTO_APP_ID "$LOGTO_APP_ID" --force
npx convex deploy
