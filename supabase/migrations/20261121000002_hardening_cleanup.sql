-- Ajustes de segurança apontados pelo linter + limpeza automática (privacidade)

alter function public.make_invite_code() set search_path = public;
revoke execute on function public.is_member(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;

-- Privacidade por padrão: o trajeto some depois de 30 dias,
-- alertas depois de 90 e links vencidos depois de 1 dia.
create extension if not exists pg_cron;

select cron.schedule(
  'familia-segura-limpeza',
  '17 4 * * *',
  $$
    delete from public.history where ts < now() - interval '30 days';
    delete from public.events where ts < now() - interval '90 days';
    delete from public.shares where expires_at < now() - interval '1 day';
  $$
);
