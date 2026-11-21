# Confiabilidade, privacidade e validação

## Escopo deste pacote

Este pacote não transforma a PWA em serviço de emergência e não implementa push com o app fechado. Não afirma conformidade LGPD nem auditoria independente de segurança. Todas as fixtures de navegador são dados sintéticos, sem localização de famílias reais. Nenhum teste de navegador precisa de senha ou acesso ao backend real.

## Correções

- GPS e sincronização agora têm estados separados. Falhas de escrita não avançam os marcadores de sucesso; há retentativa com espera crescente e serialização das atualizações.
- Pausa/desmontagem invalida callbacks e impede novas etapas assíncronas. Uma requisição já enviada não pode ser desfeita; outros aparelhos da mesma conta ainda podem enviar posições.
- SOS e chegada combinada dizem que o evento foi registrado, sem afirmar recebimento/leitura. GPS em segundo plano continua limitado pelo navegador.
- Pausa explica que a última posição e o histórico continuam disponíveis e que links existentes precisam ser revogados separadamente.
- Posições antigas/pausadas não são apresentadas como presença atual em um lugar salvo. Links públicos mostram “última localização”.
- Diálogos de SOS, convite e chegada têm Escape, ciclo de Tab e retorno do foco ao acionador.
- Prazo relativo da chegada é recalculado no envio, evitando usar um horário congelado durante a montagem do componente.
- React Router atualizado para 7.18.6; marcador Leaflet valida cor antes de interpolar HTML.
- Cabeçalhos de proteção de iframe, tipo de conteúdo, referenciador e indexação. Os cabeçalhos só entram em vigor após deploy na Vercel.

## Reprodução local

```sh
npm ci
npm run typecheck
npm test
npm run build
npm audit --omit=dev
npx playwright install chromium
npm run test:e2e
```

Se o computador já tiver Chromium: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`.

A suíte do rastreador contém sete cenários (o TAP conta também o teste agrupador). A suíte Playwright cobre login/cadastro e axe WCAG A/AA, abertura do SOS sem envio, foco e Escape, explicação de pausa e link público expirado. Passar nesses testes não comprova entrega de notificações nem isolamento real entre famílias.

## Evidências administrativas lidas em 21/11/2026

Os três jobs de limpeza/chegada estavam ativos. Supabase Advisors confirmou proteção contra senhas vazadas desativada. As funções SECURITY DEFINER expostas geram avisos; a exposição de `get_share` ao público é intencional para resolver um token, não motivo para tornar tabelas públicas. Revisar autorização das RPCs e preservar isolamento.

Referências oficiais retornadas pelos advisors:
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

## Portões ainda necessários antes de anunciar produção validada

1. Revisar e aplicar a migração de expiração de links em ambiente de homologação. Testar inserção com created_at futuro, duração acima de 24h, expiração e revogação.
2. Testar RLS com duas famílias independentes e terceiro usuário, inclusive saída, troca de círculo, histórico e RPCs. Executar em projeto isolado, não com dados de clientes.
3. Implementar limitação de tentativas e renovação/expiração de convites no servidor. O código atual não acrescenta esse controle. Um contador atualizado seguido de RAISE reverte a contagem e não é um bloqueio válido.
4. Ativar proteção contra senhas vazadas se disponível no plano; revisar SMTP e fluxos de recuperação nos domínios usados.
5. Validar em Android e iPhone reais: GPS negado, precisão baixa, tela bloqueada, perda/volta de rede e aparelho sem bateria. Testar múltiplos aparelhos da mesma conta.
6. Decidir a semântica de “ocultar minha posição” separadamente de “pausar atualizações”; projetar exclusão/exportação de dados, retenção e revisão jurídica de privacidade (especialmente crianças).
7. Medir Lighthouse no deploy final. Não há pontuação Lighthouse declarada neste pacote. Os testes E2E usam servidor local e fixtures, não constituem teste visual do domínio publicado.
8. Para push real, implementar serviço de assinatura, envio servidor e tratamento de permissão/expiração. Confirmação de leitura precisa de modelo de dados próprio. Eventos Realtime não são push garantido.

## Publicação e reversão

Este pacote foi preparado em branch separada. Antes de merge, confirmar testes do GitHub, revisar diff e testar o preview da Vercel. Não há comando automático de migração nesta integração contínua. O histórico de migrações existente tem versões remotas diferentes dos nomes dos arquivos originais; reconciliar esse histórico antes de usar `supabase db push`, sem reaplicar o esquema inicial.

Reversão da interface: reverter o commit do pacote e republicar a versão anterior. Não remover a proteção de expiração como simples rollback visual: isso reabriria a falha. Corrigir a migração de forma progressiva após revisão. Nenhuma remoção de dados pessoais faz parte deste pacote.
