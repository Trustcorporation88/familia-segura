-- Testes de regressão: validade dos links temporários (migração 20261121000004).
-- SOMENTE BANCO LOCAL DE TESTE. Roda inteiro numa transação com rollback.
-- Precisa ser executado pelo dono das tabelas (postgres), pois troca de papel
-- e desliga o gatilho para simular linhas criadas antes da correção.

\set ON_ERROR_STOP on

begin;

create schema shares_expiry_test;

create function shares_expiry_test.ok(p_cond boolean, p_name text)
returns void
language plpgsql
as $$
begin
  if p_cond is not true then
    raise exception 'FALHOU: %', p_name;
  end if;
  raise notice 'ok - %', p_name;
end $$;

-- Executa p_sql como p_role (com o JWT de p_uid) e devolve o SQLSTATE
-- ('00000' = funcionou). A mensagem do erro fica em shares_expiry_test.last_error.
create function shares_expiry_test.try(p_role text, p_uid uuid, p_sql text)
returns text
language plpgsql
as $$
begin
  perform set_config('shares_expiry_test.last_error', '', true);
  perform set_config(
    'request.jwt.claims',
    case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', p_role)::text end,
    true
  );
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
  exception when others then
    reset role;
    perform set_config('shares_expiry_test.last_error', sqlerrm, true);
    return sqlstate;
  end;
  reset role;
  return '00000';
end $$;

-- Quantas linhas o público (anon) recebe do get_share para o token.
create function shares_expiry_test.public_rows(p_token text)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  select count(*) into n from public.get_share(p_token);
  reset role;
  return n;
end $$;

-- Dois usuários (o gatilho handle_new_user cria os perfis).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'ana@example.test', '{"name":"Ana"}'),
  ('00000000-0000-4000-8000-0000000000b2', 'beto@example.test', '{"name":"Beto"}');

\set ana '00000000-0000-4000-8000-0000000000a1'

-- ---------- Estrutura ----------

select shares_expiry_test.ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.shares'::regclass and tgname = 'shares_enforce_expiry'
      and not tgisinternal and tgenabled = 'O' and (tgtype & 2) = 2 and (tgtype & 4) = 4
  ),
  'gatilho shares_enforce_expiry existe, ligado, BEFORE INSERT');
select shares_expiry_test.ok(
  has_function_privilege('anon', 'public.get_share(text)', 'execute')
  and has_function_privilege('authenticated', 'public.get_share(text)', 'execute'),
  'get_share continua liberado para anon e authenticated');
select shares_expiry_test.ok(
  not has_function_privilege('anon', 'public.shares_enforce_expiry()', 'execute')
  and not has_function_privilege('authenticated', 'public.shares_enforce_expiry()', 'execute'),
  'função do gatilho não é chamável por anon/authenticated');

-- ---------- Insert legítimo (como o app faz: sem created_at) ----------

select shares_expiry_test.ok(
  shares_expiry_test.try('authenticated', :'ana', $q$
    insert into public.shares (id, user_id, name, lat, lng, updated_at, expires_at)
    values ('legit_60min_000000000000001', '00000000-0000-4000-8000-0000000000a1', 'Ana', -22.3, -49.0, now(), now() + interval '60 minutes')
  $q$) = '00000',
  'insert legítimo de 60 min é aceito');
select shares_expiry_test.ok(
  (select created_at = now() and expires_at = now() + interval '60 minutes'
   from public.shares where id = 'legit_60min_000000000000001'),
  'created_at = now() do servidor e expires_at preservado');
select shares_expiry_test.ok(
  shares_expiry_test.public_rows('legit_60min_000000000000001') = 1,
  'link legítimo abre em público (get_share)');

-- ---------- O furo: created_at do cliente ----------

select shares_expiry_test.ok(
  shares_expiry_test.try('authenticated', :'ana', $q$
    insert into public.shares (id, user_id, name, created_at, expires_at)
    values ('forged_365d_000000000000001', '00000000-0000-4000-8000-0000000000a1', 'x', now() + interval '364 days', now() + interval '365 days')
  $q$) = '23514',
  'created_at +364 d / expires_at +365 d é rejeitado (23514)');
select shares_expiry_test.ok(
  current_setting('shares_expiry_test.last_error') = 'invalid_expires_at',
  'mensagem do erro é invalid_expires_at');
select shares_expiry_test.ok(
  not exists (select 1 from public.shares where id = 'forged_365d_000000000000001')
  and shares_expiry_test.public_rows('forged_365d_000000000000001') = 0,
  'link forjado não foi gravado nem abre em público');

select shares_expiry_test.ok(
  shares_expiry_test.try('authenticated', :'ana', $q$
    insert into public.shares (id, user_id, created_at, expires_at)
    values ('forged_future_created_00001', '00000000-0000-4000-8000-0000000000a1', now() + interval '364 days', now() + interval '1 hour')
  $q$) = '00000'
  and (select created_at = now() from public.shares where id = 'forged_future_created_00001'),
  'created_at futuro com expires_at válido: aceito, mas created_at vira now()');
select shares_expiry_test.ok(
  shares_expiry_test.try('authenticated', :'ana', $q$
    insert into public.shares (id, user_id, created_at, expires_at)
    values ('forged_past_created_000001', '00000000-0000-4000-8000-0000000000a1', now() - interval '30 days', now() + interval '1 hour')
  $q$) = '00000'
  and (select created_at = now() from public.shares where id = 'forged_past_created_000001'),
  'created_at passado enviado pelo cliente também vira now()');

-- ---------- Limites de expires_at ----------

select shares_expiry_test.ok(
  shares_expiry_test.try('authenticated', :'ana', $q$
    insert into public.shares (id, user_id, expires_at)
    values ('bound_exact_24h_0000000001', '00000000-0000-4000-8000-0000000000a1', now() + interval '24 hours')
  $q$) = '00000'
  and shares_expiry_test.public_rows('bound_exact_24h_0000000001') = 1,
  'exatamente now() + 24 h é aceito e abre em público');
select shares_expiry_test.ok(
  shares_expiry_test.try('authenticated', :'ana', $q$
    insert into public.shares (id, user_id, expires_at)
    values ('bound_over_24h_00000000001', '00000000-0000-4000-8000-0000000000a1', now() + interval '24 hours 1 microsecond')
  $q$) = '23514',
  'now() + 24 h + 1 microssegundo é rejeitado');
select shares_expiry_test.ok(
  shares_expiry_test.try('authenticated', :'ana', $q$
    insert into public.shares (id, user_id, expires_at)
    values ('bound_30_days_000000000001', '00000000-0000-4000-8000-0000000000a1', now() + interval '30 days')
  $q$) = '23514',
  'expires_at +30 dias sem created_at é rejeitado');
select shares_expiry_test.ok(
  shares_expiry_test.try('authenticated', :'ana', $q$
    insert into public.shares (id, user_id, expires_at)
    values ('bound_equal_now_0000000001', '00000000-0000-4000-8000-0000000000a1', now())
  $q$) = '23514',
  'expires_at = now() é rejeitado (precisa ser maior)');
select shares_expiry_test.ok(
  shares_expiry_test.try('authenticated', :'ana', $q$
    insert into public.shares (id, user_id, expires_at)
    values ('bound_in_the_past_00000001', '00000000-0000-4000-8000-0000000000a1', now() - interval '1 minute')
  $q$) = '23514',
  'expires_at no passado é rejeitado');
select shares_expiry_test.ok(
  shares_expiry_test.try('authenticated', :'ana', $q$
    insert into public.shares (id, user_id, expires_at)
    values ('bound_null_expires_0000001', '00000000-0000-4000-8000-0000000000a1', null)
  $q$) = '23514',
  'expires_at nulo é rejeitado');
select shares_expiry_test.ok(
  shares_expiry_test.try('authenticated', :'ana', $q$
    insert into public.shares (id, user_id, expires_at) values
      ('multi_good_row_00000000001', '00000000-0000-4000-8000-0000000000a1', now() + interval '1 hour'),
      ('multi_bad_row_000000000001', '00000000-0000-4000-8000-0000000000a1', now() + interval '48 hours')
  $q$) = '23514'
  and not exists (select 1 from public.shares where id like 'multi_%'),
  'insert em lote com uma linha inválida falha inteiro');

-- ---------- O gatilho vale para qualquer papel ----------

insert into public.shares (id, user_id, created_at, expires_at)
values ('owner_role_forged_00000001', :'ana', now() + interval '10 days', now() + interval '2 hours');
select shares_expiry_test.ok(
  (select created_at = now() from public.shares where id = 'owner_role_forged_00000001'),
  'insert como dono da tabela (fora do PostgREST) também tem created_at carimbado');
select shares_expiry_test.ok(
  shares_expiry_test.try('service_role', null, $q$
    insert into public.shares (id, user_id, created_at, expires_at)
    values ('service_role_forged_000001', '00000000-0000-4000-8000-0000000000a1', now() + interval '364 days', now() + interval '365 days')
  $q$) = '23514',
  'service_role também não consegue criar link acima de 24 h');

-- ---------- Caminhos de escrita que continuam fechados ----------

select shares_expiry_test.ok(
  shares_expiry_test.try('anon', null, $q$
    insert into public.shares (id, user_id, expires_at)
    values ('anon_insert_00000000000001', '00000000-0000-4000-8000-0000000000a1', now() + interval '1 hour')
  $q$) = '42501',
  'anon não cria link');
select shares_expiry_test.ok(
  shares_expiry_test.try('authenticated', :'ana', $q$
    update public.shares set expires_at = now() + interval '365 days' where id = 'legit_60min_000000000000001'
  $q$) = '42501',
  'dono não consegue UPDATE em expires_at');
select shares_expiry_test.ok(
  shares_expiry_test.try('authenticated', :'ana', $q$
    update public.shares set created_at = now() + interval '365 days' where id = 'legit_60min_000000000000001'
  $q$) = '42501',
  'dono não consegue UPDATE em created_at');
select shares_expiry_test.ok(
  shares_expiry_test.try('authenticated', :'ana', $q$
    insert into public.shares (id, user_id, expires_at)
    values ('legit_60min_000000000000001', '00000000-0000-4000-8000-0000000000a1', now() + interval '23 hours')
    on conflict (id) do update set expires_at = excluded.expires_at
  $q$) = '42501',
  'upsert não serve para esticar expires_at');
select shares_expiry_test.ok(
  (select expires_at = now() + interval '60 minutes' from public.shares where id = 'legit_60min_000000000000001'),
  'expires_at do link legítimo ficou intacto');

-- ---------- Comportamento que não muda (posição, pausa, revogação) ----------

select shares_expiry_test.ok(
  shares_expiry_test.try('authenticated', :'ana', $q$
    update public.shares set lat = -23.5, lng = -46.6, updated_at = now() where id = 'legit_60min_000000000000001'
  $q$) = '00000'
  and (select created_at = now() and expires_at = now() + interval '60 minutes' and lat = -23.5
       from public.shares where id = 'legit_60min_000000000000001'),
  'dono atualiza lat/lng/updated_at; datas do link não mudam');
select shares_expiry_test.ok(
  shares_expiry_test.try('anon', null, $q$
    do $d$ begin
      if (select lat from public.get_share('legit_60min_000000000000001')) is distinct from -23.5 then
        raise exception 'posição não atualizada';
      end if;
    end $d$
  $q$) = '00000',
  'público vê a última posição gravada (é o que fica visível com o GPS pausado)');
select shares_expiry_test.ok(
  shares_expiry_test.try('authenticated', '00000000-0000-4000-8000-0000000000b2', $q$
    do $d$ begin
      if exists (select 1 from public.shares where id = 'legit_60min_000000000000001') then
        raise exception 'outro usuário enxergou o link';
      end if;
    end $d$
  $q$) = '00000',
  'outro usuário não lista o link pela tabela');
select shares_expiry_test.ok(
  shares_expiry_test.try('authenticated', :'ana', $q$
    delete from public.shares where id = 'bound_exact_24h_0000000001'
  $q$) = '00000'
  and shares_expiry_test.public_rows('bound_exact_24h_0000000001') = 0,
  'dono apaga o link e ele some do público');

-- ---------- Linhas antigas (criadas antes da correção) ----------
-- Simula dados pré-migração desligando o gatilho só dentro desta transação.

alter table public.shares disable trigger shares_enforce_expiry;
insert into public.shares (id, user_id, name, created_at, expires_at) values
  ('legacy_forged_365d_0000001', :'ana', 'x', now() + interval '364 days', now() + interval '365 days'),
  ('legacy_forged_10min_000001', :'ana', 'x', now() + interval '10 minutes', now() + interval '24 hours 10 minutes'),
  ('legacy_forged_soon_0000001', :'ana', 'x', now() + interval '1 minute', now() + interval '2 hours'),
  ('legacy_legit_active_000001', :'ana', 'x', now() - interval '1 hour', now() + interval '1 hour'),
  ('legacy_legit_full_24h_0001', :'ana', 'x', now() - interval '1 second', now() + interval '24 hours' - interval '1 second'),
  ('legacy_expired_00000000001', :'ana', 'x', now() - interval '2 hours', now() - interval '1 hour');
alter table public.shares enable trigger shares_enforce_expiry;

select shares_expiry_test.ok(
  shares_expiry_test.public_rows('legacy_forged_365d_0000001') = 0,
  'linha antiga forjada (+364 d / +365 d) não abre em público');
select shares_expiry_test.ok(
  shares_expiry_test.public_rows('legacy_forged_10min_000001') = 0,
  'linha antiga com created_at +10 min e validade além de 24 h não abre');
select shares_expiry_test.ok(
  shares_expiry_test.public_rows('legacy_forged_soon_0000001') = 0,
  'linha antiga com created_at no futuro não abre, mesmo vencendo em 2 h');
select shares_expiry_test.ok(
  shares_expiry_test.public_rows('legacy_legit_active_000001') = 1
  and shares_expiry_test.public_rows('legacy_legit_full_24h_0001') = 1,
  'links antigos legítimos e ainda válidos continuam abrindo');
select shares_expiry_test.ok(
  shares_expiry_test.public_rows('legacy_expired_00000000001') = 0,
  'link vencido não abre');
select shares_expiry_test.ok(
  (select count(*) from public.shares where id like 'legacy_%') = 6,
  'nenhuma linha antiga foi apagada pela correção');
select shares_expiry_test.ok(
  shares_expiry_test.public_rows('token_que_nao_existe_000001') = 0,
  'token inexistente não devolve nada');

-- Defesa extra do get_share: mesmo sem a regra shares_max_24h, validade acima
-- de 24 h a partir de agora não é servida.
alter table public.shares drop constraint shares_max_24h;
alter table public.shares disable trigger shares_enforce_expiry;
insert into public.shares (id, user_id, name, created_at, expires_at)
values ('legacy_no_constraint_30d_1', :'ana', 'x', now() - interval '1 hour', now() + interval '30 days');
alter table public.shares enable trigger shares_enforce_expiry;
select shares_expiry_test.ok(
  shares_expiry_test.public_rows('legacy_no_constraint_30d_1') = 0,
  'get_share recusa validade > 24 h mesmo sem a regra shares_max_24h');

rollback;

\echo 'shares_expiry: todos os testes passaram'
