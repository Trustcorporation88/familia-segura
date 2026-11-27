// Testa a migração do Atalho do iPhone num PostgreSQL isolado (PGlite). Sem acesso à produção.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const db = new PGlite()
const U = '00000000-0000-0000-0000-00000000000a' // dona do atalho
const C = '00000000-0000-0000-0000-0000000000c1'
const P = '00000000-0000-0000-0000-0000000000f1' // lugar "Casa"
// Esquema mínimo com as mesmas colunas usadas pela migração.
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table public.profiles (id uuid primary key, name text not null default '', color text not null default '#7c3aed', circle_id uuid);
create table public.circle_members (circle_id uuid, user_id uuid, primary key (circle_id, user_id));
create table public.locations (circle_id uuid, user_id uuid, name text not null default '', color text not null default '#7c3aed',
  lat double precision, lng double precision, accuracy real, battery smallint, charging boolean, sharing boolean not null default true,
  updated_at timestamptz, primary key (circle_id, user_id));
create table public.history (id bigint generated always as identity primary key, circle_id uuid, user_id uuid, lat double precision, lng double precision, ts timestamptz not null default now());
create table public.places (id uuid primary key, circle_id uuid, name text, emoji text default '📍', lat double precision, lng double precision, radius integer);
create table public.events (id uuid primary key default gen_random_uuid(), circle_id uuid, type text, user_id uuid, name text default '',
  place_id uuid, place_name text, lat double precision, lng double precision, due_at timestamptz, ts timestamptz not null default clock_timestamp());
create table public.checkins (id uuid primary key default gen_random_uuid(), circle_id uuid, user_id uuid, name text default '', place_id uuid,
  place_name text, due_at timestamptz, grace_minutes smallint default 10, status text default 'active', created_at timestamptz default now(),
  finished_at timestamptz, alerted_at timestamptz);
insert into public.profiles values ('${U}', 'Cyntia', '#e11d48', '${C}');
insert into public.circle_members values ('${C}', '${U}');
insert into public.places values ('${P}', '${C}', 'Casa', '🏠', -22.0, -49.0, 100);
`)
await db.exec(readFileSync(new URL('../supabase/migrations/20261127000001_atalho_iphone.sql', import.meta.url), 'utf8'))

let n = 0
const one = async (sql, params) => (await db.query(sql, params)).rows[0]
const report = (token, lat, lng, bat = null) => one('select public.report_location($1, $2, $3, $4) as r', [token, lat, lng, bat])
const skipWait = () => db.exec(`update public.location_tokens set last_used_at = now() - interval '1 minute'`)
async function rejects(promise, code) { await assert.rejects(promise, (e) => e.code === code); n++ }

// Sem login não gera chave.
await rejects(db.query('select public.create_location_token()'), 'P0001')
await db.exec(`set test.uid = '${U}'`)
const { t: token } = await one('select public.create_location_token() as t')
assert.match(token, /^[0-9a-f]{64}$/); n++
assert.equal((await one('select count(*)::int as c from public.location_tokens where token_hash = $1', [token])).c, 0, 'guarda só o hash'); n++
await db.exec(`reset test.uid`)

// Chave errada ou posição inválida são recusadas.
await rejects(report('x'.repeat(64), -22.0, -49.0), '28000')
await rejects(report(token, 95, -49.0), '22023')
await rejects(report(token, 0, 0), '22023')

// Primeira posição (fora de casa): grava localização e histórico, sem alerta de lugar.
assert.equal((await report(token, -22.01, -49.0, 0.57)).r, 'ok'); n++
let loc = await one(`select lat, battery, name, updated_at is not null as fresh from public.locations where user_id = '${U}'`)
assert.deepEqual(loc, { lat: -22.01, battery: 57, name: 'Cyntia', fresh: true }); n++
assert.equal((await one('select count(*)::int as c from public.history')).c, 1); n++
assert.equal((await one('select count(*)::int as c from public.events')).c, 0); n++

// Envio repetido em menos de 15 s é ignorado.
assert.match((await report(token, -22.0, -49.0)).r, /^ignorado/); n++

// Chega em casa: alerta "arrive" + histórico novo (andou mais de 75 m).
await skipWait()
assert.equal((await report(token, -22.0001, -49.0, 80)).r, 'ok'); n++
assert.equal((await one(`select type from public.events order by ts desc limit 1`)).type, 'arrive'); n++
assert.equal((await one('select count(*)::int as c from public.history')).c, 2); n++

// Oscilando na borda (110 m, dentro da histerese de 30 m): continua em casa, sem alerta.
await skipWait()
await report(token, -22.0 - 110 / 111195, -49.0)
assert.equal((await one('select count(*)::int as c from public.events')).c, 1); n++

// Sai de casa: alerta "leave".
await skipWait()
await report(token, -22.01, -49.0)
assert.equal((await one(`select type from public.events order by ts desc limit 1`)).type, 'leave'); n++

// Anti-repetição: o site tenta registrar outro "leave" para o mesmo lugar e é ignorado.
await db.exec(`insert into public.events (circle_id, type, user_id, place_id) values ('${C}', 'leave', '${U}', '${P}')`)
assert.equal((await one(`select count(*)::int as c from public.events where type = 'leave'`)).c, 1); n++

// Chegada combinada para Casa: ao chegar, vira "chegou bem".
await db.exec(`insert into public.checkins (circle_id, user_id, name, place_id, place_name, due_at) values ('${C}', '${U}', 'Cyntia', '${P}', 'Casa', now() + interval '1 hour')`)
await skipWait()
await report(token, -22.0, -49.0)
assert.equal((await one('select status from public.checkins')).status, 'arrived'); n++
assert.equal((await one(`select count(*)::int as c from public.events where type = 'checkin_ok'`)).c, 1); n++

// Compartilhamento pausado: não atualiza.
await db.exec(`update public.locations set sharing = false`)
await skipWait()
assert.equal((await report(token, -23.0, -49.0)).r, 'compartilhamento pausado'); n++
assert.equal((await one('select lat from public.locations')).lat, -22.0); n++
await db.exec(`update public.locations set sharing = true`)

// Gerar outra chave invalida a anterior.
await db.exec(`set test.uid = '${U}'`)
const { t: token2 } = await one('select public.create_location_token() as t')
await db.exec(`reset test.uid`)
await rejects(report(token, -22.0, -49.0), '28000')
assert.equal((await report(token2, -22.0, -49.0)).r, 'ok'); n++

console.log(`${n} asserções do Atalho do iPhone passaram em PostgreSQL isolado (PGlite). Sem acesso à produção.`)
await db.close()
