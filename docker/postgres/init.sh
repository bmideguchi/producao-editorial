#!/bin/sh
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_password="$APP_DB_PASSWORD" \
  -v db_name="$POSTGRES_DB" <<'SQL'
CREATE ROLE editorial_app LOGIN PASSWORD :'app_password';
CREATE SCHEMA editorial AUTHORIZATION editorial_app;
GRANT USAGE, CREATE ON SCHEMA editorial TO editorial_app;
REVOKE ALL ON SCHEMA public FROM editorial_app;
REVOKE CREATE ON DATABASE :"db_name" FROM PUBLIC;
ALTER ROLE editorial_app SET search_path TO editorial;
SQL
