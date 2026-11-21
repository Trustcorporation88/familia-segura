-- Mock mínimo do ambiente Supabase para rodar as migrações num Postgres local.
-- SOMENTE PARA BANCO DE TESTE DESCARTÁVEL. Nunca rode em produção.
--
-- Cria: papéis anon / authenticated / service_role, schema auth (users, uid(),
-- role()), privilégios padrão iguais aos do Supabase, a publicação
-- supabase_realtime e um stub de cron.schedule (pg_cron não existe localmente).

\set ON_ERROR_STOP on

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

-- Mesmos privilégios padrão do Supabase no schema public (é por isso que a
-- migração inicial precisa dos "revoke").
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb
);

-- Mesma definição do Supabase: lê o "sub" do JWT que o PostgREST põe na sessão.
create function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

create publication supabase_realtime;

-- Stub do pg_cron: só aceita a chamada, não agenda nada.
create schema cron;
create function cron.schedule(job_name text, schedule text, command text)
returns bigint
language sql
as $$ select 1::bigint $$;
