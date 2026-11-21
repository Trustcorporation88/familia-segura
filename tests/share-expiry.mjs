import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const db = new PGlite()
await db.exec(`create role anon; create role authenticated;
create table public.shares (id text primary key,name text,color text,lat double precision,lng double precision,updated_at timestamptz,created_at timestamptz default now(),expires_at timestamptz);`)
await db.exec(readFileSync(new URL('../supabase/migrations/20261121000004_shares_expiry_server_side.sql', import.meta.url),'utf8'))
let n=0
async function reject(sql) { try { await db.exec(sql) } catch(e) { assert.equal(e.code,'23514'); n++; return } throw Error('Expected rejection') }
await reject(`insert into shares(id,created_at,expires_at) values('future',now()+interval '364 days',now()+interval '365 days')`)
await reject(`insert into shares(id,expires_at) values('past',now()-interval '1 minute')`)
await reject(`insert into shares(id,expires_at) values('long',now()+interval '25 hours')`)
await reject(`insert into shares(id,expires_at) values('null',null)`)
await db.exec(`insert into shares(id,created_at,expires_at) values('valid',now()+interval '1 year',now()+interval '1 hour')`)
assert.equal((await db.query(`select created_at <= now() as ok from shares where id='valid'`)).rows[0].ok,true);n++
assert.equal((await db.query(`select * from get_share('valid')`)).rows.length,1);n++
await db.exec(`update shares set lat=1 where id='valid'`);n++
await db.exec(`alter table shares disable trigger shares_enforce_expiry; insert into shares(id,created_at,expires_at) values('legacy',now()+interval '1 year',now()+interval '1 year 1 hour'); alter table shares enable trigger shares_enforce_expiry;`)
assert.equal((await db.query(`select * from get_share('legacy')`)).rows.length,0);n++
await db.exec(`delete from shares where id='valid'`)
assert.equal((await db.query(`select * from get_share('valid')`)).rows.length,0);n++
console.log(`${n} SQL expiry assertions passed on isolated PostgreSQL (PGlite). No production access.`)
await db.close()
