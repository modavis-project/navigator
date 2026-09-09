#!/bin/sh
set -eu
pg_restore --exit-on-error --no-owner --no-privileges --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" /artifacts/modavis-pod-1.6.0-public-postgresql.dump
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=read_password="$NAVIGATOR_READ_PASSWORD" <<'SQL'
CREATE ROLE navigator_read LOGIN PASSWORD :'read_password';
REVOKE ALL ON DATABASE navigator_pod FROM PUBLIC;
GRANT CONNECT ON DATABASE navigator_pod TO navigator_read;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA release_1_5_public TO navigator_read;
GRANT SELECT ON ALL TABLES IN SCHEMA release_1_5_public TO navigator_read;
ALTER ROLE navigator_read SET default_transaction_read_only = on;
ANALYZE;
SQL
