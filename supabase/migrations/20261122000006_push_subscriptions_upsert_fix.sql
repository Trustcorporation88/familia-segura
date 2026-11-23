-- Correção: o app salva a assinatura com upsert (insert ... on conflict do update),
-- e o Postgres exige privilégio de UPDATE em todas as colunas enviadas, inclusive
-- user_id e endpoint. A RLS continua garantindo que só o dono mexe na própria linha.
-- Aplicada em produção em 22/11/2026.
grant update (endpoint, user_id, p256dh, auth, ua) on public.push_subscriptions to authenticated;
