-- Família Segura: esquema inicial (Supabase / Postgres)
-- Tudo protegido por RLS. Operações que mexem em várias tabelas
-- (criar/entrar/sair de círculo, ler link público) são funções SECURITY DEFINER.

create extension if not exists pgcrypto;

-- ---------- Tabelas ----------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 80),
  email text not null default '',
  phone text not null default '' check (char_length(phone) <= 20),
  color text not null default '#7c3aed' check (color ~ '^#[0-9a-fA-F]{6}$'),
  circle_id uuid,
  created_at timestamptz not null default now()
);

create table public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{6}$'),
  created_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_circle_fk foreign key (circle_id) references public.circles (id) on delete set null;

create table public.circle_members (
  circle_id uuid not null references public.circles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);
create index circle_members_user_idx on public.circle_members (user_id);

create table public.locations (
  circle_id uuid not null references public.circles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null default '',
  color text not null default '#7c3aed',
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  accuracy real,
  battery smallint check (battery between 0 and 100),
  charging boolean,
  sharing boolean not null default true,
  updated_at timestamptz,
  primary key (circle_id, user_id)
);

create table public.history (
  id bigint generated always as identity primary key,
  circle_id uuid not null references public.circles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  ts timestamptz not null default now()
);
create index history_lookup_idx on public.history (circle_id, user_id, ts);
create index history_ts_idx on public.history (ts);

create table public.places (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  emoji text not null default '📍' check (char_length(emoji) <= 8),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  radius integer not null check (radius between 50 and 2000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index places_circle_idx on public.places (circle_id);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles (id) on delete cascade,
  type text not null check (type in ('arrive', 'leave', 'sos')),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null default '',
  place_id uuid references public.places (id) on delete set null,
  place_name text,
  lat double precision,
  lng double precision,
  ts timestamptz not null default now()
);
create index events_circle_ts_idx on public.events (circle_id, ts desc);

create table public.shares (
  id text primary key check (char_length(id) >= 24),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null default '',
  color text not null default '#7c3aed',
  lat double precision,
  lng double precision,
  updated_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint shares_max_24h check (expires_at <= created_at + interval '24 hours')
);
create index shares_user_idx on public.shares (user_id);

-- ---------- Funções auxiliares ----------

create or replace function public.is_member(p_circle uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.circle_members
    where circle_id = p_circle and user_id = auth.uid()
  );
$$;

-- Cria o perfil automaticamente no cadastro (dados vêm do signUp options.data)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, phone, color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'color', ''), '#7c3aed')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.make_invite_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.circles where invite_code = code);
  end loop;
  return code;
end;
$$;

-- ---------- RPCs ----------

create or replace function public.create_circle(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_circle uuid;
  v_profile public.profiles;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found then raise exception 'profile_missing'; end if;

  insert into public.circles (name, owner_id, invite_code)
  values (left(coalesce(nullif(trim(p_name), ''), 'Minha família'), 40), v_uid, public.make_invite_code())
  returning id into v_circle;

  insert into public.circle_members (circle_id, user_id) values (v_circle, v_uid);
  insert into public.locations (circle_id, user_id, name, color)
  values (v_circle, v_uid, v_profile.name, v_profile.color)
  on conflict do nothing;
  update public.profiles set circle_id = v_circle where id = v_uid;
  return v_circle;
end;
$$;

create or replace function public.join_circle(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_circle uuid;
  v_profile public.profiles;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found then raise exception 'profile_missing'; end if;

  select id into v_circle from public.circles
  where invite_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_circle is null then raise exception 'invalid_code'; end if;

  insert into public.circle_members (circle_id, user_id) values (v_circle, v_uid) on conflict do nothing;
  insert into public.locations (circle_id, user_id, name, color)
  values (v_circle, v_uid, v_profile.name, v_profile.color)
  on conflict do nothing;
  update public.profiles set circle_id = v_circle where id = v_uid;
  return v_circle;
end;
$$;

create or replace function public.leave_circle(p_circle uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_next uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  delete from public.circle_members where circle_id = p_circle and user_id = v_uid;
  delete from public.locations where circle_id = p_circle and user_id = v_uid;
  update public.profiles set circle_id = null where id = v_uid and circle_id = p_circle;

  -- Se o dono saiu, passa o círculo para o membro mais antigo (ou apaga se ficou vazio)
  if exists (select 1 from public.circles where id = p_circle and owner_id = v_uid) then
    select user_id into v_next from public.circle_members
    where circle_id = p_circle order by joined_at limit 1;
    if v_next is null then
      delete from public.circles where id = p_circle;
    else
      update public.circles set owner_id = v_next where id = p_circle;
    end if;
  end if;
end;
$$;

-- Link público: devolve um único link se ainda não expirou (sem permitir listar)
create or replace function public.get_share(p_token text)
returns table (id text, name text, color text, lat double precision, lng double precision, updated_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, s.color, s.lat, s.lng, s.updated_at, s.expires_at
  from public.shares s
  where s.id = p_token and s.expires_at > now();
$$;

revoke all on function public.create_circle(text) from public, anon;
revoke all on function public.join_circle(text) from public, anon;
revoke all on function public.leave_circle(uuid) from public, anon;
grant execute on function public.create_circle(text) to authenticated;
grant execute on function public.join_circle(text) to authenticated;
grant execute on function public.leave_circle(uuid) to authenticated;
grant execute on function public.get_share(text) to anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.make_invite_code() from public, anon, authenticated;

-- ---------- RLS ----------

alter table public.profiles enable row level security;
alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.locations enable row level security;
alter table public.history enable row level security;
alter table public.places enable row level security;
alter table public.events enable row level security;
alter table public.shares enable row level security;

-- Perfil: só o dono. circle_id só muda pelas RPCs.
create policy "perfil: ler o próprio" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "perfil: editar o próprio" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Círculo
create policy "círculo: membros leem" on public.circles
  for select to authenticated using (public.is_member(id));
create policy "círculo: dono renomeia" on public.circles
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "membros: membros leem" on public.circle_members
  for select to authenticated using (public.is_member(circle_id));

-- Localização atual
create policy "local: membros leem" on public.locations
  for select to authenticated using (public.is_member(circle_id));
create policy "local: cada um grava a sua" on public.locations
  for insert to authenticated with check (user_id = (select auth.uid()) and public.is_member(circle_id));
create policy "local: cada um atualiza a sua" on public.locations
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_member(circle_id));

-- Histórico
create policy "histórico: membros leem" on public.history
  for select to authenticated using (public.is_member(circle_id));
create policy "histórico: cada um grava o seu" on public.history
  for insert to authenticated with check (user_id = (select auth.uid()) and public.is_member(circle_id));
create policy "histórico: cada um apaga o seu" on public.history
  for delete to authenticated using (user_id = (select auth.uid()));

-- Lugares
create policy "lugares: membros leem" on public.places
  for select to authenticated using (public.is_member(circle_id));
create policy "lugares: membros criam" on public.places
  for insert to authenticated with check (public.is_member(circle_id));
create policy "lugares: membros editam" on public.places
  for update to authenticated using (public.is_member(circle_id)) with check (public.is_member(circle_id));
create policy "lugares: membros apagam" on public.places
  for delete to authenticated using (public.is_member(circle_id));

-- Alertas
create policy "alertas: membros leem" on public.events
  for select to authenticated using (public.is_member(circle_id));
create policy "alertas: cada um cria os seus" on public.events
  for insert to authenticated with check (user_id = (select auth.uid()) and public.is_member(circle_id));

-- Links temporários: só o dono vê e mexe (o público usa get_share)
create policy "links: dono lê" on public.shares
  for select to authenticated using (user_id = (select auth.uid()));
create policy "links: dono cria" on public.shares
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "links: dono atualiza" on public.shares
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "links: dono apaga" on public.shares
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------- Colunas que o app pode alterar ----------
-- (circle_id, owner_id, invite_code, expires_at... só mudam pelas RPCs)
revoke update on public.profiles, public.circles, public.shares from anon, authenticated;
grant update (name, phone, color) on public.profiles to authenticated;
grant update (name) on public.circles to authenticated;
grant update (lat, lng, updated_at) on public.shares to authenticated;
revoke insert, delete on public.circles, public.circle_members, public.profiles from anon, authenticated;
revoke all on all tables in schema public from anon;

-- ---------- Tempo real ----------

alter publication supabase_realtime add table public.locations, public.places, public.events, public.circles, public.circle_members, public.profiles, public.shares;
