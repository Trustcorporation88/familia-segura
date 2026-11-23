-- Link de compartilhamento do Google Maps de cada membro (opcional).
-- Fica na linha de localização do círculo: só membros do círculo leem (RLS existente)
-- e cada um só altera a própria linha. Aceita apenas links do Google Maps.
alter table public.locations
  add column if not exists maps_link text
  check (
    maps_link is null
    or (
      char_length(maps_link) <= 300
      and maps_link ~ '^https://(maps\.app\.goo\.gl/|goo\.gl/maps/|(www\.)?google\.com(\.[a-z]{2})?/maps|maps\.google\.com(\.[a-z]{2})?/)'
    )
  );
