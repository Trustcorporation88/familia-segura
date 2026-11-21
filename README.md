# Família Segura

App web (PWA) de localização familiar no estilo Life360, em português.
React + Vite + TypeScript, Tailwind, Firebase (Auth + Firestore) e Leaflet/OpenStreetMap.

## O que tem

- **Círculo familiar** com código de convite de 6 letras (criar, entrar, sair, renomear)
- **Mapa ao vivo** com pins por pessoa, agrupamento automático (cluster) quando estão juntos, bateria, "atualizado há X" e pin cinza para posição antiga
- **Lugares (cercas virtuais)**: Casa, Escola, Trabalho… com raio ajustável. Alertas automáticos de **chegada e saída**, com histerese para não disparar alerta falso quando o GPS oscila na borda
- **SOS** no centro da barra inferior: avisa todo o círculo com a localização e tem atalhos para 190 e 192
- **Histórico do dia**: trajeto no mapa, km percorridos, horário de início e fim, navegação por dia
- **Link temporário**: compartilha a localização ao vivo por 15 min, 1 h, 4 h ou 8 h com quem não tem o app. O link expira sozinho e pode ser desativado
- **Alertas**: feed de chegadas, saídas e SOS, com aviso na tela e notificação do navegador
- **Pausar compartilhamento** quando quiser
- PWA instalável (Android e iPhone), com cache dos mapas

## Rodando local

```bash
cp .env.example .env   # preencha com os dados do Firebase
npm install
npm run dev
```

## Configuração do Firebase (uma vez)

1. **Authentication → Sign-in method**: ative **E-mail/senha**.
2. **Authentication → Settings → Authorized domains**: adicione o domínio da Vercel (ex.: `familia-segura-omega.vercel.app`).
3. **Firestore Database**: crie o banco (modo produção).
4. Publique as **regras e índices** deste repositório:

```bash
npm i -g firebase-tools
firebase login
firebase use --add            # escolha o seu projeto
firebase deploy --only firestore:rules,firestore:indexes
```

Sem o índice, a tela de Histórico mostra um aviso. O índice leva alguns minutos para ficar pronto.

## Deploy na Vercel

1. Importe este repositório na Vercel (Framework: **Vite**).
2. Em **Settings → Environment Variables**, cadastre todas as variáveis `VITE_FIREBASE_*` do `.env.example`.
3. Deploy. O `vercel.json` já faz as rotas do app (inclusive `/s/:token`) funcionarem ao recarregar a página.

## Estrutura do Firestore

```
users/{uid}                         perfil (só o próprio usuário lê)
inviteCodes/{CODIGO}                -> { circleId }
circles/{id}                        { name, ownerId, members[], inviteCode }
circles/{id}/locations/{uid}        última posição de cada membro
circles/{id}/history/{auto}         pontos do trajeto { uid, lat, lng, ts }
circles/{id}/places/{auto}          cercas { name, emoji, lat, lng, radius }
circles/{id}/events/{auto}          alertas { type: arrive|leave|sos, ... }
shares/{token}                      link temporário (público até expiresAt)
```

As regras em `firestore.rules` garantem que só membros do círculo veem a localização uns dos outros, que cada um só escreve a própria posição, e que o link temporário deixa de ser lido assim que expira.

## Limitações conhecidas (e próximos passos)

- **Localização em segundo plano**: navegadores só enviam GPS com o app aberto na tela. Para rastrear com o celular bloqueado é preciso empacotar como app nativo (ex.: [Capacitor](https://capacitorjs.com) + plugin de background geolocation).
- **Push com o app fechado**: hoje os alertas aparecem com o app aberto. Para push real, adicionar Firebase Cloud Messaging + uma Cloud Function disparada em `circles/{id}/events`.
- **Limpeza do histórico**: configure uma [política de TTL](https://firebase.google.com/docs/firestore/ttl) no campo `ts` da coleção `history` (ex.: 30 dias) para não acumular dados.

## Referências usadas

- [Turf.js](https://github.com/Turfjs/turf): distâncias e cercas virtuais
- [react-leaflet](https://github.com/PaulLeCam/react-leaflet) e [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster): mapa e agrupamento
- Ideias de produto: [Traccar](https://github.com/traccar/traccar-web) (histórico e cercas), [Hauk](https://github.com/bilde2910/Hauk) (link temporário), [OwnTracks](https://github.com/owntracks/frontend) (linha do tempo)
