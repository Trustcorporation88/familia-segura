#!/usr/bin/env bash
# Testes de regressão da validade dos links (migração 20261121000004).
#
# Roda SOMENTE num Postgres local (13+). Cria um banco descartável, aplica o
# mock do Supabase, as migrações 0001-0003, prova que o furo existe, aplica a
# 0004 (duas vezes, para checar que é idempotente) e roda os testes.
# No fim apaga o banco. Os papéis anon/authenticated/service_role ficam criados
# no cluster local.
#
# Uso (a partir de qualquer pasta):
#   PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres supabase/local-tests/shares_expiry/run.sh
#
# Sem Postgres instalado? `pip install pgserver` traz initdb/pg_ctl/psql:
#   BIN=$(python3 -c "import pgserver,os;print(os.path.dirname(pgserver.__file__))")/pginstall/bin
#   $BIN/initdb -D /tmp/pgt/data -U postgres -A trust
#   $BIN/pg_ctl -D /tmp/pgt/data -o "-p 54329 -k /tmp/pgt -c listen_addresses=127.0.0.1" -w start
#   PATH=$BIN:$PATH PGHOST=127.0.0.1 PGPORT=54329 PGUSER=postgres supabase/local-tests/shares_expiry/run.sh
#
# pgcrypto e pg_cron não são necessários: as linhas "create extension" das
# migrações antigas são puladas (gen_random_uuid é nativo; cron.schedule é stub).

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS="$(cd "$HERE/../../migrations" && pwd)"

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"

# Trava de segurança: só host local (ou socket unix).
case "$PGHOST" in
  localhost|127.0.0.1|::1|/*) ;;
  *) echo "ABORTADO: PGHOST='$PGHOST' não é local. Estes testes não rodam em banco remoto." >&2; exit 2 ;;
esac
if [ -n "${DATABASE_URL:-}${PGSERVICE:-}" ]; then
  echo "ABORTADO: DATABASE_URL/PGSERVICE definidos; use só PGHOST/PGPORT/PGUSER locais." >&2; exit 2
fi

DB="fs_shares_expiry_test_$$"
PSQL=(psql -X -q -v ON_ERROR_STOP=1)

cleanup() { "${PSQL[@]}" -d postgres -c "drop database if exists \"$DB\" with (force)" >/dev/null 2>&1 || true; }
trap cleanup EXIT

"${PSQL[@]}" -d postgres -c "create database \"$DB\""

step() { echo; echo "== $1"; }

step "mock do Supabase"
"${PSQL[@]}" -d "$DB" -f "$HERE/00_mock_supabase.sql"

for m in 20261121000001_init.sql 20261121000002_hardening_cleanup.sql 20261121000003_chegada_combinada.sql; do
  step "migração $m"
  [ -f "$MIGRATIONS/$m" ] || { echo "faltando: $MIGRATIONS/$m" >&2; exit 1; }
  sed -E 's/^(create extension if not exists (pgcrypto|pg_cron);)/-- [teste local] \1/' "$MIGRATIONS/$m" \
    | "${PSQL[@]}" -d "$DB" -f -
done

step "pré-correção: o furo precisa ser reproduzível"
"${PSQL[@]}" -d "$DB" -f "$HERE/01_prefix_bypass_repro.sql"

FIX="$MIGRATIONS/20261121000004_shares_expiry_server_side.sql"
step "migração 20261121000004 (1ª vez)"
"${PSQL[@]}" -d "$DB" -f "$FIX"
step "migração 20261121000004 (2ª vez, idempotência)"
"${PSQL[@]}" -d "$DB" -f "$FIX"

step "testes"
"${PSQL[@]}" -d "$DB" -f "$HERE/02_shares_expiry.test.sql"

echo
echo "TUDO OK"
