-- Chegada combinada ("plano de viagem" do montanhismo/busca e salvamento)
-- A pessoa diz para onde vai e até quando chega. Se chegar, a família recebe
-- "chegou bem". Se o prazo + tolerância passar, O SERVIDOR (pg_cron) dispara o
-- alerta com a última posição conhecida, mesmo se o celular dela morreu.

-- Novos tipos de alerta
alter table public.events drop constraint if exists events_type_check;
alter table public.events
  add constraint events_type_check check (type in ('arrive', 'leave', 'sos', 'checkin_start', 'checkin_ok', 'checkin_late'));
alter table public.events add column if not exists due_at timestamptz;

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null default '',
  place_id uuid references public.places (id) on delete set null,
  place_name text not null,
  due_at timestamptz not null,
  grace_minutes smallint not null default 10 check (grace_minutes between 0 and 60),
  status text not null default 'active' check (status in ('active', 'arrived', 'late', 'cancelled')),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  alerted_at timestamptz
);
create index checkins_circle_idx on public.checkins (circle_id, created_at desc);
create index checkins_active_due_idx on public.checkins (due_at) where status = 'active';
create unique index checkins_one_active_per_user on public.checkins (circle_id, user_id) where status in ('active', 'late');

alter table public.checkins enable row level security;
create policy "chegada: membros leem" on public.checkins
  for select to authenticated using (public.is_member(circle_id));
-- Escrita só pelas funções abaixo
revoke insert, update, delete on public.checkins from anon, authenticated;
revoke all on public.checkins from anon;

-- Inicia (substitui qualquer combinado em aberto da mesma pessoa)
create or replace function public.start_checkin(p_place uuid, p_due timestamptz, p_grace integer default 10)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_place public.places;
  v_name text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_place from public.places where id = p_place;
  if not found or not public.is_member(v_place.circle_id) then raise exception 'invalid_place'; end if;
  if p_due < now() + interval '1 minute' or p_due > now() + interval '12 hours' then raise exception 'invalid_due'; end if;
  select name into v_name from public.profiles where id = v_uid;

  update public.checkins set status = 'cancelled', finished_at = now()
  where circle_id = v_place.circle_id and user_id = v_uid and status in ('active', 'late');

  insert into public.checkins (circle_id, user_id, name, place_id, place_name, due_at, grace_minutes)
  values (v_place.circle_id, v_uid, coalesce(v_name, ''), v_place.id, v_place.name, p_due, least(greatest(coalesce(p_grace, 10), 0), 60))
  returning id into v_id;

  insert into public.events (circle_id, type, user_id, name, place_id, place_name, due_at)
  values (v_place.circle_id, 'checkin_start', v_uid, coalesce(v_name, ''), v_place.id, v_place.name, p_due);
  return v_id;
end;
$$;

-- Termina: 'arrived' (chegou) ou 'cancelled'
create or replace function public.finish_checkin(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_c public.checkins;
  v_loc public.locations;
begin
  if p_status not in ('arrived', 'cancelled') then raise exception 'invalid_status'; end if;
  select * into v_c from public.checkins where id = p_id and user_id = v_uid and status in ('active', 'late');
  if not found then return; end if;

  update public.checkins set status = p_status, finished_at = now() where id = p_id;

  if p_status = 'arrived' then
    select * into v_loc from public.locations where circle_id = v_c.circle_id and user_id = v_uid;
    insert into public.events (circle_id, type, user_id, name, place_id, place_name, lat, lng, due_at)
    values (v_c.circle_id, 'checkin_ok', v_uid, v_c.name, v_c.place_id, v_c.place_name, v_loc.lat, v_loc.lng, v_c.due_at);
  end if;
end;
$$;

-- Dá mais tempo (ex.: trânsito)
create or replace function public.extend_checkin(p_id uuid, p_minutes integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_minutes not between 5 and 120 then raise exception 'invalid_minutes'; end if;
  update public.checkins
  set due_at = greatest(due_at, now()) + make_interval(mins => p_minutes),
      status = 'active',
      alerted_at = null
  where id = p_id and user_id = auth.uid() and status in ('active', 'late');
end;
$$;

-- Roda a cada minuto no servidor: quem passou do prazo vira alerta para a família
create or replace function public.process_overdue_checkins()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select c.*, l.lat as last_lat, l.lng as last_lng
    from public.checkins c
    left join public.locations l on l.circle_id = c.circle_id and l.user_id = c.user_id
    where c.status = 'active'
      and c.due_at + make_interval(mins => c.grace_minutes) < now()
    for update of c skip locked
  loop
    update public.checkins set status = 'late', alerted_at = now() where id = r.id;
    insert into public.events (circle_id, type, user_id, name, place_id, place_name, lat, lng, due_at)
    values (r.circle_id, 'checkin_late', r.user_id, r.name, r.place_id, r.place_name, r.last_lat, r.last_lng, r.due_at);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.start_checkin(uuid, timestamptz, integer) from public, anon;
revoke all on function public.finish_checkin(uuid, text) from public, anon;
revoke all on function public.extend_checkin(uuid, integer) from public, anon;
revoke all on function public.process_overdue_checkins() from public, anon, authenticated;
grant execute on function public.start_checkin(uuid, timestamptz, integer) to authenticated;
grant execute on function public.finish_checkin(uuid, text) to authenticated;
grant execute on function public.extend_checkin(uuid, integer) to authenticated;

select cron.schedule('familia-segura-chegadas', '* * * * *', $$ select public.process_overdue_checkins(); $$);

-- Limpeza: combinados antigos somem com 30 dias
select cron.schedule(
  'familia-segura-limpeza-chegadas',
  '27 4 * * *',
  $$ delete from public.checkins where created_at < now() - interval '30 days' and status <> 'active'; $$
);

alter publication supabase_realtime add table public.checkins;
