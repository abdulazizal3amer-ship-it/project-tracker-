#!/usr/bin/env bash
# Runs the migrations on a throwaway database and executes the RLS tests.
# Uses the standard PG* environment variables (PGHOST, PGUSER, PGPASSWORD…).
set -euo pipefail
cd "$(dirname "$0")/../.."

DB="${TEST_DB:-project_tracker_test}"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"

run() { psql -v ON_ERROR_STOP=1 -q -X -t -o /dev/null -d "$DB" -f "$1" 2>&1 | sed -E "s/^psql:[^ ]+ NOTICE:  //"; test "${PIPESTATUS[0]}" -eq 0; }
run tests/sql/supabase_stub.sql
run supabase/migrations/001_tables.sql
run supabase/migrations/002_rls.sql
run supabase/migrations/004_team_members.sql
run supabase/migrations/005_task_schedule.sql
run supabase/migrations/006_attachments.sql
run tests/sql/rls_test.sql

echo "SQL tests passed"
