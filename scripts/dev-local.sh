#!/usr/bin/env bash
# Runs `next dev` against the local Supabase stack (`supabase start`), reading its URLs and keys
# from `supabase status` so no .env file is needed. Binds to 0.0.0.0 so phones on the LAN can join.
set -euo pipefail
cd "$(dirname "$0")/.."

while IFS='=' read -r key raw; do
  raw="${raw%\"}"
  raw="${raw#\"}"
  case "$key" in
    API_URL) export NEXT_PUBLIC_SUPABASE_URL="$raw" ;;
    PUBLISHABLE_KEY) export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$raw" ;;
    DB_URL) export DATABASE_URL="$raw" ;;
  esac
done < <(supabase status -o env)

exec npx next dev --hostname 0.0.0.0 --port "${PORT:-3000}"
