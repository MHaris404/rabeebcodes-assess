#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@15/bin}"
mkdir -p .local
if [ ! -f .local/postgres/PG_VERSION ]; then
  "$PG_BIN/initdb" -D "$PWD/.local/postgres" -A trust -U supportdesk > .local/initdb.log
fi
if ! "$PG_BIN/pg_ctl" -D "$PWD/.local/postgres" status >/dev/null 2>&1; then
  "$PG_BIN/pg_ctl" -D "$PWD/.local/postgres" -l "$PWD/.local/postgres.log" -o "-p 55432 -h 127.0.0.1 -k $PWD/.local" start
fi
for db in supportdesk supportdesk_test supportdesk_bench; do
  if ! "$PG_BIN/psql" -h 127.0.0.1 -p 55432 -U supportdesk -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | /usr/bin/grep -q 1; then
    "$PG_BIN/createdb" -h 127.0.0.1 -p 55432 -U supportdesk "$db"
  fi
done
echo "Local PostgreSQL ready on 127.0.0.1:55432 (development only)."
