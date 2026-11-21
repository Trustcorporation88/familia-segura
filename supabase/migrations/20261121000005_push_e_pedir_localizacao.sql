-- Push com o app fechado + "pedir localização"
--
-- 1) push_subscriptions: cada aparelho que aceitou notificações guarda a
--    assinatura Web Push (endpoint + chaves). Só o dono vê/mexe nas suas.
-- 2) events ganha o tipo 'ping' (alguém pediu a localização de um membro
--    específico, target_user_id) e pushed_at (idempotência do envio).
-- 3) Gatilho AFTER INSERT em events chama a Edge Function send-push via pg_net.
--    A URL e o segredo ficam no Vault (nunca no código). A função só reenvia
--    um evento ainda não enviado, então uma chamada forjada não gera spam.
-- 4) push_secret(): lê um segredo do Vault; só a service_role (Edge Function).
--
-- Os segredos (vapid_private_key, vapid_public_key, push_webhook_secret,
-- push_function_url) são criados à parte com vault.create_secret, fora do git.

create extension if not exists pg_net with schema extensions;

-- ---------- Assinaturas de push ----------

create table if not exists public.push_subscriptions (
  endpoint text primary key check (char_length(endpoint) between 20 and 2000 and endpoint like 'https://%'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 10 and 100),
  ua text not null default '' check (char_length(ua) <= 200),
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  failures smallint not null default 0
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists "push: dono lê" on public.push_subscriptions;
drop policy if exists "push: dono cria" on public.push_subscriptions;
drop policy if exists "push: dono atualiza" on public.push_subscriptions;
drop policy if exists "push: dono apaga" on public.push_subscriptions;
create policy "push: dono lê" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "push: dono cria" on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "push: dono atualiza" on public.push_subscriptions
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "push: dono apaga" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.push_subscriptions from anon;
revoke update on public.push_subscriptions from authenticated;
grant update (p256dh, auth, ua) on public.push_subscriptions to authenticated;

-- ---------- Evento "pedir localização" ----------

alter table public.events drop constraint if exists events_type_check;
alter table public.events
  add constraint events_type_check check (type in ('arrive', 'leave', 'sos', 'checkin_start', 'checkin_ok', 'checkin_late', 'ping'));
alter table public.events add column if not exists target_user_id uuid references public.profiles (id) on delete cascade;
alter table public.events add column if not exists pushed_at timestamptz;
create index if not exists events_target_idx on public.events (target_user_id) where target_user_id is not null;

-- ping: precisa de alvo, o alvo tem que ser do mesmo círculo e não pode ser o próprio autor.
-- Outros tipos: alvo sempre nulo. pushed_at nunca vem do cliente.
create or replace function public.events_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.pushed_at := null;
  if new.type = 'ping' then
    if new.target_user_id is null or new.target_user_id = new.user_id then
      raise exception 'invalid_ping_target' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.circle_members m where m.circle_id = new.circle_id and m.user_id = new.target_user_id) then
      raise exception 'invalid_ping_target' using errcode = 'check_violation';
    end if;
  else
    new.target_user_id := null;
  end if;
  return new;
end;
$$;
revoke all on function public.events_validate() from public, anon, authenticated;
drop trigger if exists events_validate on public.events;
create trigger events_validate
  before insert on public.events
  for each row execute function public.events_validate();

-- ---------- Segredos (Vault) para a Edge Function ----------

create or replace function public.push_secret(p_name text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret
  from vault.decrypted_secrets s
  where s.name = p_name
  limit 1;
$$;
revoke all on function public.push_secret(text) from public, anon, authenticated;
grant execute on function public.push_secret(text) to service_role;

-- ---------- Gatilho: avisa a Edge Function ----------

create or replace function public.notify_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_function_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_url is null or v_secret is null then
    return new; -- push ainda não configurado: o evento continua valendo no app
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('event_id', new.id),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  -- Falha no envio do push nunca pode impedir o registro do evento.
  return new;
end;
$$;
revoke all on function public.notify_push() from public, anon, authenticated;
drop trigger if exists events_push on public.events;
create trigger events_push
  after insert on public.events
  for each row execute function public.notify_push();
