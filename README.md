# Família Segura

App web (PWA) de localização familiar no estilo Life360, em português.
React + Vite + TypeScript, Tailwind, Supabase (Auth + Postgres + Realtime) e Leaflet/OpenStreetMap.

## O que tem

- **Círculo familiar** com código de convite de 6 letras (criar, entrar, sair, renomear)
- **Mapa ao vivo** com pins por pessoa, agrupamento automático (cluster) quando estão juntos, bateria, "atualizado há X" e pin cinza para posição antiga
- **Lugares (cercas virtuais)**: Casa, Escola, Trabalho… com raio ajustável. Alertas automáticos de **chegada e saída**, com histerese para não disparar alerta falso quando o GPS oscila na borda
- **Chegada combinada** (inspirada no "plano de viagem" do montanhismo e de busca e salvamento): a pessoa escolhe o destino e o horário. Ao entrar na cerca do destino, a família recebe "chegou bem" automaticamente. Se o prazo + 10 min de tolerância passar, **o próprio servidor** (pg_cron, a cada minuto) dispara o alerta com a última posição conhecida, mesmo que o celular tenha descarregado ou ficado sem sinal. Dá para adiar (+15 min), confirmar na mão ou cancelar
- **SOS** no centro da barra inferior: avisa todo o círculo com a localização e tem atalhos para 190 e 192
- **Histórico do dia**: trajeto no mapa, km percorridos, horário de início e fim, navegação por dia
- **Link temporário**: compartilha a localização ao vivo por 15 min, 1 h, 4 h ou 8 h com quem não tem o app. O link expira sozinho e pode ser desativado
- **Alertas**: feed de chegadas, saídas e SOS, com aviso na tela e notificação do navegador
- **Pausar compartilhamento** quando quiser
- PWA instalável (Android e iPhone), com cache dos mapas

## Rodando local

```bash
npm install
npm run dev
```

O app já aponta para o projeto Supabase **familia-segura** (São Paulo). Para usar outro projeto, copie `.env.example` para `.env`.

## Backend: Supabase

Tudo que o app precisa está em `supabase/migrations/` e **já foi aplicado** no projeto `familia-segura`:

- Tabelas: `profiles`, `circles`, `circle_members`, `locations`, `history`, `places`, `events`, `shares`
- **RLS em todas as tabelas**: só membros do círculo veem a localização uns dos outros; cada um só grava a própria posição; anônimos não leem nada
- Funções (RPC): `create_circle`, `join_circle`, `leave_circle` e `get_share` (link público sem permitir listar outros links)
- Perfil criado automaticamente no cadastro (gatilho em `auth.users`)
- Tempo real (Realtime) em localização, lugares, alertas e círculo
- **Chegada combinada no servidor**: `start_checkin`, `finish_checkin`, `extend_checkin` e o job `process_overdue_checkins` (a cada minuto)
- **Limpeza automática (pg_cron, todo dia 04:17 UTC)**: trajeto apagado após 30 dias, alertas após 90, links vencidos após 1 dia

### Configuração do Auth (uma vez, no painel do Supabase)

1. **Authentication → URL Configuration**
   - Site URL: `https://familia-segura-omega.vercel.app` (ou `https://gpsprivado.online` quando o domínio estiver apontado)
   - Redirect URLs: `https://familia-segura-omega.vercel.app/**` e `https://gpsprivado.online/**`
2. **E-mails**: o SMTP padrão do Supabase envia poucos e-mails por hora. Para uso real, configure um SMTP próprio em **Authentication → Emails → SMTP Settings** (ex.: Resend, Brevo).
   Alternativa para testes: desligar "Confirm email" em **Authentication → Sign In / Providers → Email**.

## Deploy na Vercel

Conectado ao GitHub: cada push no `main` publica sozinho. Não precisa de variáveis de ambiente (a URL e a chave *publishable* do Supabase são públicas por natureza; a proteção é o RLS).

## Estrutura

```
src/lib/supabase.ts      cliente Supabase
src/lib/api.ts           acesso a dados + tempo real
src/lib/geo.ts           cercas virtuais (Turf.js) com histerese
src/context/             login, círculo, GPS (TrackerContext), avisos
src/pages/               telas
supabase/migrations/     esquema, RLS e rotinas do banco
```

## App Android (localização em segundo plano)

O navegador só envia GPS com o site aberto na tela. Para atualizar com o celular bloqueado, use o app Android (pasta `android/`, gerada com [Capacitor](https://capacitorjs.com) + `@capacitor-community/background-geolocation`). Ele usa o mesmo código e o mesmo Supabase do site.

- Gerar o APK: `npm run android:apk` (precisa de JDK 17 e Android SDK). O arquivo sai em `android/app/build/outputs/apk/debug/app-debug.apk`.
- Instalar: mandar o APK para o celular e abrir (permitir "instalar apps desconhecidos").
- Na primeira abertura: permitir localização e notificações. Fica uma notificação fixa "Compartilhando sua localização" enquanto o rastreamento roda (exigência do Android).
- **Bateria**: em Ajustes do Android → Apps → Família Segura → Bateria, escolha **Sem restrições**. Xiaomi, Samsung e Motorola matam apps em segundo plano se isso não for feito.
- Com o app instalado, alertas do círculo (SOS, atraso, chegada) viram notificação do sistema mesmo com a tela bloqueada.
- Parado no lugar, o app reenvia a posição a cada 5 minutos para mostrar que o celular segue ativo.

## Limitações conhecidas (e próximos passos)

- **iPhone**: o plugin já suporta iOS (`npx cap add ios`), mas compilar exige um Mac com Xcode. Com Apple ID gratuito o app instalado expira em 7 dias; a conta paga (US$ 99/ano) só é necessária para não expirar ou para publicar.
- **Site no navegador**: continua só atualizando com a página aberta na tela.
- **Push com o app fechado**: hoje os alertas aparecem com o app aberto. Para push real: Web Push (VAPID) + uma Edge Function do Supabase disparada por um Database Webhook em `events`.

## Referências usadas

- [Turf.js](https://github.com/Turfjs/turf): distâncias e cercas virtuais
- [react-leaflet](https://github.com/PaulLeCam/react-leaflet) e [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster): mapa e agrupamento
- Ideias de produto: [Traccar](https://github.com/traccar/traccar-web) (histórico e cercas), [Hauk](https://github.com/bilde2910/Hauk) (link temporário), [OwnTracks](https://github.com/owntracks/frontend) (linha do tempo)
