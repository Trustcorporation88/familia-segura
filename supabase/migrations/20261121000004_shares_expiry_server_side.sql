-- Links temporários: validade decidida pelo SERVIDOR (corrige o furo do created_at)
--
-- Problema: a regra shares_max_24h compara expires_at com created_at, e o
-- created_at podia vir do cliente. Mandando created_at no futuro
-- (ex.: +364 dias) e expires_at = created_at + 24 h, o link público ficava
-- válido por um ano e o get_share o devolvia normalmente.
--
-- Correção (só validade dos links, nada além disso):
--   1) Gatilho BEFORE INSERT: created_at passa a ser sempre now() do servidor,
--      e expires_at precisa estar em (now(), now() + 24 h]. Fora disso o
--      insert falha com 23514 (mesmo código da regra antiga -> HTTP 400).
--   2) get_share ignora linhas antigas com datas forjadas: só devolve o link se
--      created_at <= now() e now() < expires_at <= now() + 24 h.
--
-- O que NÃO muda:
--   - Nenhum dado é apagado nem alterado. Links forjados que já existam ficam
--     na tabela (o dono ainda vê e pode apagar), só deixam de abrir em público.
--   - A regra shares_max_24h continua (agora sobre um created_at confiável).
--   - Permissões e RLS: o app segue podendo atualizar só lat, lng e updated_at;
--     expires_at e created_at continuam sem UPDATE para anon/authenticated.
--   - Pausar o compartilhamento continua igual: o link mostra a última posição
--     gravada até vencer ou ser apagado pelo dono.
--   - Assinatura, retorno e grants do get_share (anon e authenticated).
--
-- Pode rodar mais de uma vez sem efeito colateral.

-- ---------- 1) Insert: servidor carimba created_at e valida expires_at ----------

create or replace function public.shares_enforce_expiry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Ignora qualquer created_at enviado pelo cliente.
  new.created_at := now();

  if new.expires_at is null
     or new.expires_at <= new.created_at
     or new.expires_at > new.created_at + interval '24 hours' then
    raise exception 'invalid_expires_at'
      using errcode = 'check_violation',
            detail = 'expires_at precisa ser maior que agora e no máximo 24 horas à frente (hora do servidor).';
  end if;

  return new;
end;
$$;

revoke all on function public.shares_enforce_expiry() from public, anon, authenticated;

drop trigger if exists shares_enforce_expiry on public.shares;
create trigger shares_enforce_expiry
  before insert on public.shares
  for each row execute function public.shares_enforce_expiry();

-- ---------- 2) Leitura pública: não confia em datas antigas ----------
-- Um link legítimo sempre tem created_at <= agora e expires_at <= agora + 24 h.
-- Linhas criadas antes desta migração com created_at no futuro ficam de fora.

create or replace function public.get_share(p_token text)
returns table (id text, name text, color text, lat double precision, lng double precision, updated_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, s.color, s.lat, s.lng, s.updated_at, s.expires_at
  from public.shares s
  where s.id = p_token
    and s.expires_at > now()
    and s.created_at <= now()
    and s.expires_at <= now() + interval '24 hours';
$$;
