-- Roda ANTES da migração 20261121000004: prova que o furo existe no esquema
-- antigo (created_at do cliente no futuro => link público válido por ~1 ano).
-- Se este arquivo falhar, o mock não está fiel e os testes seguintes não valem.
-- Tudo dentro de uma transação com rollback: não deixa dados.

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-4000-8000-0000000000a1', 'repro@example.test', '{"name":"Repro"}');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true) \g /dev/null

set local role authenticated;
insert into public.shares (id, user_id, name, created_at, expires_at)
values ('repro_forged_created_at_0001', '00000000-0000-4000-8000-0000000000a1', 'repro',
        now() + interval '364 days', now() + interval '365 days');
reset role;

set local role anon;
do $$
begin
  if (select count(*) from public.get_share('repro_forged_created_at_0001')) <> 1 then
    raise exception 'pré-correção: esperava o link forjado visível em get_share (furo não reproduzido)';
  end if;
  raise notice 'ok - pré-correção: furo reproduzido (link de 365 dias aceito e visível em público)';
end $$;
reset role;

rollback;
