# Estado da entrega

As correções foram implementadas e verificadas localmente. A migração de expiração de links FOI aplicada em produção em 21/11/2026 e reverificada: created_at futuro e validade acima de 24 h passaram a ser recusados; link legítimo continua funcionando.

O arquivo ZIP contém o projeto editado (sem node_modules, .git ou credenciais), instruções e testes. O patch pode ser aplicado ao commit base `4b0b851ea0aa473c599eb9b040170666df0d023a` com `git apply familia-segura.patch` na raiz de uma cópia limpa do repositório.

Após aplicar o patch, executar os comandos em VALIDACAO.md, revisar as migrações, criar um commit e abrir pull request. A autorização do GitHub precisa permitir gravação de conteúdo para que isso possa ser feito pela integração.

Resultados locais: build e typecheck passaram; sete cenários de rastreador (o TAP conta oito com o agrupador) e quatro testes de navegador passaram. Axe não encontrou violações WCAG A/AA nas telas de login e cadastro cobertas. Auditoria de dependências de produção retornou zero vulnerabilidades conhecidas no momento da execução. Isso não certifica segurança completa nem compatibilidade com celulares reais.
