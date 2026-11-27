-- Atalho do iPhone: o app Atalhos (Shortcuts) envia a localização sem o site aberto.
--
-- O iPhone não deixa sites usarem GPS em segundo plano. Uma automação do Atalhos
-- (ao abrir o WhatsApp, chegar em casa, ligar o carregador, horários...) chama
-- report_location() com uma chave secreta da pessoa. Não usa senha nem sessão:
-- a chave só serve para gravar a posição de quem a gerou e pode ser trocada a
-- qualquer momento (gerar outra invalida a anterior). No banco fica só o hash.
--
-- A posição recebida dispara no servidor o mesmo que o app faria: histórico,
-- chegada/saída de lugares e "chegou bem" da chegada combinada.

-- ---------- Chaves ----------

create table if not exists public.location_tokens (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.location_tokens enable row level security;
-- Sem políticas: acesso só pelas funções abaixo.
revoke all on public.location_tokens from anon, authenticated;

-- Estado "dentro/fora" de cada lugar para posições vindas do servidor (histerese).
create table if not exists public.server_place_states (
  user_id uuid not null references public.profiles (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  inside boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, place_id)
);
alter table public.server_place_states enable row level security;
revoke all on public.server_place_states from anon, authenticated;

-- Gera (ou troca) a chave da pessoa logada. Devolve a chave em texto uma única vez.
create or replace function public.create_location_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  -- 2 UUID v4 aleatórios = 244 bits de aleatoriedade forte.
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.location_tokens (user_id, token_hash)
  values (v_uid, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'))
  on conflict (user_id) do update
    set token_hash = excluded.token_hash, created_at = now(), last_used_at = null;
  return v_token;
end;
$$;

-- Situação da chave da pessoa logada (sem revelar a chave).
create or replace function public.location_token_status()
returns table (created_at timestamptz, last_used_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select t.created_at, t.last_used_at from public.location_tokens t where t.user_id = auth.uid();
$$;

create or replace function public.revoke_location_token()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.location_tokens where user_id = auth.uid();
$$;

-- Distância em metros (haversine).
create or replace function public.meters_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 2 * 6371008.8 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- ---------- Recebe a posição do Atalhos ----------

create or replace function public.report_location(
  p_token text,
  p_lat double precision,
  p_lng double precision,
  p_battery double precision default null,
  p_accuracy double precision default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_last_used timestamptz;
  v_prof public.profiles;
  v_circle uuid;
  v_sharing boolean;
  v_bat smallint;
  v_acc real;
  v_hist record;
  v_place record;
  v_dist double precision;
  v_was boolean;
  v_now_inside boolean;
  v_ck public.checkins;
  v_dest public.places;
begin
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 128 then
    raise exception 'invalid_token' using errcode = '28000';
  end if;
  select t.user_id, t.last_used_at into v_uid, v_last_used
  from public.location_tokens t
  where t.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if v_uid is null then raise exception 'invalid_token' using errcode = '28000'; end if;

  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180
     or (p_lat = 0 and p_lng = 0) then
    raise exception 'invalid_position' using errcode = '22023';
  end if;

  -- Várias automações podem disparar juntas: no máximo um envio a cada 15 s.
  if v_last_used is not null and v_last_used > now() - interval '15 seconds' then
    return 'ignorado: enviado há menos de 15 s';
  end if;
  update public.location_tokens set last_used_at = now() where user_id = v_uid;

  select * into v_prof from public.profiles where id = v_uid;
  v_circle := v_prof.circle_id;
  if v_circle is null or not exists (
    select 1 from public.circle_members m where m.circle_id = v_circle and m.user_id = v_uid
  ) then
    return 'sem círculo';
  end if;

  select l.sharing into v_sharing from public.locations l where l.circle_id = v_circle and l.user_id = v_uid;
  if v_sharing is false then return 'compartilhamento pausado'; end if;

  -- O Atalhos devolve a bateria de 0 a 100 (ou 0 a 1 em versões antigas).
  v_bat := case
    when p_battery is null or p_battery < 0 then null
    when p_battery <= 1 then round(p_battery * 100)
    else round(least(p_battery, 100))
  end;
  v_acc := case when p_accuracy is null or p_accuracy < 0 or p_accuracy > 100000 then null else p_accuracy end;

  insert into public.locations (circle_id, user_id, name, color, lat, lng, accuracy, battery, charging, updated_at)
  values (v_circle, v_uid, coalesce(v_prof.name, ''), coalesce(v_prof.color, '#7c3aed'), p_lat, p_lng, v_acc, v_bat, null, now())
  on conflict (circle_id, user_id) do update
    set name = excluded.name, color = excluded.color, lat = excluded.lat, lng = excluded.lng,
        accuracy = excluded.accuracy, battery = excluded.battery, charging = null, updated_at = now();

  -- Histórico: mesma regra do app (75 m ou 10 min).
  select h.lat, h.lng, h.ts into v_hist
  from public.history h where h.circle_id = v_circle and h.user_id = v_uid
  order by h.ts desc limit 1;
  if not found or v_hist.ts < now() - interval '10 minutes'
     or public.meters_between(v_hist.lat, v_hist.lng, p_lat, p_lng) >= 75 then
    insert into public.history (circle_id, user_id, lat, lng) values (v_circle, v_uid, p_lat, p_lng);
  end if;

  -- Chegada combinada: chegou ao destino => "chegou bem".
  select * into v_ck from public.checkins c
  where c.circle_id = v_circle and c.user_id = v_uid and c.status in ('active', 'late')
  limit 1;
  if found and v_ck.place_id is not null then
    select * into v_dest from public.places where id = v_ck.place_id;
    if found and public.meters_between(v_dest.lat, v_dest.lng, p_lat, p_lng) <= v_dest.radius then
      update public.checkins set status = 'arrived', finished_at = now() where id = v_ck.id;
      insert into public.events (circle_id, type, user_id, name, place_id, place_name, lat, lng, due_at)
      values (v_circle, 'checkin_ok', v_uid, v_ck.name, v_ck.place_id, v_ck.place_name, p_lat, p_lng, v_ck.due_at);
    end if;
  end if;

  -- Lugares: chegou/saiu, com a mesma histerese do app. Primeira leitura só registra.
  for v_place in select * from public.places p where p.circle_id = v_circle loop
    v_dist := public.meters_between(v_place.lat, v_place.lng, p_lat, p_lng);
    select s.inside into v_was from public.server_place_states s where s.user_id = v_uid and s.place_id = v_place.id;
    if v_was is true then
      v_now_inside := v_dist <= v_place.radius + greatest(30, v_place.radius * 0.15);
    else
      v_now_inside := v_dist <= v_place.radius;
    end if;
    insert into public.server_place_states (user_id, place_id, inside, updated_at)
    values (v_uid, v_place.id, v_now_inside, now())
    on conflict (user_id, place_id) do update set inside = excluded.inside, updated_at = now();
    if v_was is not null and v_was <> v_now_inside then
      insert into public.events (circle_id, type, user_id, name, place_id, place_name, lat, lng)
      values (v_circle, case when v_now_inside then 'arrive' else 'leave' end, v_uid,
              coalesce(v_prof.name, ''), v_place.id, v_place.name, p_lat, p_lng);
    end if;
  end loop;

  return 'ok';
end;
$$;

-- ---------- Sem alerta repetido ----------
-- A mesma pessoa pode mandar posição pelo Atalhos e pelo site. Se o último aviso
-- daquele lugar já foi "chegou", outro "chegou" é ignorado (idem "saiu").
create index if not exists events_user_place_idx on public.events (user_id, place_id, ts desc)
  where type in ('arrive', 'leave');

create or replace function public.events_dedupe_place()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type in ('arrive', 'leave') and new.place_id is not null then
    if (
      select e.type from public.events e
      where e.user_id = new.user_id and e.place_id = new.place_id and e.type in ('arrive', 'leave')
      order by e.ts desc limit 1
    ) = new.type then
      return null;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.events_dedupe_place() from public, anon, authenticated;
drop trigger if exists events_dedupe_place on public.events;
create trigger events_dedupe_place
  before insert on public.events
  for each row execute function public.events_dedupe_place();

-- ---------- Permissões ----------
revoke all on function public.create_location_token() from public, anon;
revoke all on function public.location_token_status() from public, anon;
revoke all on function public.revoke_location_token() from public, anon;
revoke all on function public.report_location(text, double precision, double precision, double precision, double precision) from public;
grant execute on function public.create_location_token() to authenticated;
grant execute on function public.location_token_status() to authenticated;
grant execute on function public.revoke_location_token() to authenticated;
-- O Atalhos chama sem login (só com a chave pública do projeto + a chave secreta da pessoa).
grant execute on function public.report_location(text, double precision, double precision, double precision, double precision) to anon, authenticated;
