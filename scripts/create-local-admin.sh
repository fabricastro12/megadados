#!/usr/bin/env bash
# Creates an admin on the local Supabase stack: `npm run admin:local -- <email> <password>`.
set -euo pipefail
cd "$(dirname "$0")/.."

while IFS='=' read -r key raw; do
  raw="${raw%\"}"
  raw="${raw#\"}"
  case "$key" in
    API_URL) export SUPABASE_URL="$raw" ;;
    SERVICE_ROLE_KEY) export SUPABASE_SERVICE_ROLE_KEY="$raw" ;;
    DB_URL) export DATABASE_URL="$raw" ;;
  esac
done < <(supabase status -o env)

exec node scripts/create-admin.ts "$@"
