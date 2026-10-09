#!/usr/bin/env bash
# Applies stubs + all migrations to a scratch database and runs the SQL permission tests.
# Usage: DB=bf_test ./supabase/tests/run.sh   (set PSQL="su postgres -c" style wrappers yourself if needed)
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${DB:-bf_test}
case "$DB" in
  *test*) ;;
  *) echo "Refusing to run: this script DROPS the public, auth and storage schemas. Use a scratch database whose name contains 'test'. NEVER point it at your Supabase project."; exit 1;;
esac
if [ -n "${PGHOST:-}" ] && echo "$PGHOST" | grep -qi "supabase"; then echo "Refusing to run against Supabase."; exit 1; fi
run() { psql -q -v ON_ERROR_STOP=1 -d "$DB" "$@" 2>&1 | grep -v "NOTICE:  \(policy\|trigger\|constraint\|schema\)" || true; }
psql -q -d "$DB" -c "DROP SCHEMA IF EXISTS test CASCADE; DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS storage CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO PUBLIC;" >/dev/null 2>&1
run -f tests/00_supabase_stubs.sql >/dev/null
for f in migrations/*.sql; do run -f "$f" | grep -i "error" && exit 1 || true; done
for t in tests/10_permissions.sql tests/20_integrations.sql; do psql -v ON_ERROR_STOP=1 -d "$DB" -f "$t" 2>&1 | grep -E "PASS|FAIL|ERROR" | sed "s/^.*NOTICE:  //"; done
