---
title: "Plan 2: Migration, Hardening, and Rollout for Provider/Model UX"
status: completed
priority: HIGH
parallelizable: partial
updated: 2026-02-22
owner: "platform-reliability"
---

# Plan 2: Migration, Hardening, and Rollout

## Objetivo

Garantir rollout seguro da nova UX de providers/modelos, com migracao de setups existentes e cobertura de testes/documentacao.

## Escopo tecnico

1. Migracao e compatibilidade
- Ler estado legado:
  - `models.providers.*.apiKey`
  - env vars atuais
  - auth profiles existentes
- Produzir estado consolidado sem quebrar setups atuais.
- Nao remover caminhos legados; apenas priorizar nova UX.

2. Hardening de seguranca
- Garantir redacao de segredos em todos os payloads e logs.
- Validar auditoria para operacoes sensiveis.
- Reforcar escopos/admin em todos os novos metodos.

3. Observabilidade
- Metricas novas:
  - `provider_credential_upsert_total`
  - `provider_credential_test_total`
  - `provider_models_discovery_fail_total`
- Logs estruturados de discovery/test sem segredo.

4. Documentacao e operacao
- Atualizar:
  - `.context/docs/config-console-guide.md`
  - FAQ de provider/model
  - guia rapido de onboarding de credenciais
- Incluir troubleshooting para:
  - credencial valida mas sem modelos
  - provider sem suporte a discovery live
  - fallback para catalogo built-in

5. Rollout por feature flag
- Flag de backend para novos metodos (safe rollout)
- Flag de frontend para nova tela
- Rollback rapido para fluxo atual

## Arquivos alvo (estimado)

- `src/gateway/runtime-metrics.ts`
- `src/gateway/server-methods/*` (auditoria e metrica)
- `ui/src/ui/*` (flags de exibicao)
- `.context/docs/*` (guias)

## Testes

1. Integracao
- migracao de configuracao legada -> novo fluxo
- coexistencia de config raw + nova UI

2. E2E
- setup provider -> test -> selecionar modelo -> enviar chat
- trocar provider/model do agente sem editar JSON manual

3. Seguranca
- snapshot de respostas sem segredo
- auditoria criada para mutate/test

## Criterio de aceite

- Setup legado continua operacional.
- Nova UX cobre fluxo principal completo sem JSON manual.
- Telemetria e troubleshooting suficientes para suporte.

## Complexidade detalhada

- Dominio tecnico: medio
- Risco de regressao: medio
- Esforco estimado: 2 a 3 dias uteis

## Execucao (2026-02-22)

- Concluido:
  - Feature flag de backend para RPC de providers (`OPENCLAW_PROVIDERS_RPC_ENABLED`) com gating em handlers e lista de metodos.
  - Feature flag de frontend para UI de providers (`VITE_OPENCLAW_PROVIDERS_UI_ENABLED`) com ocultacao de aba/rota.
  - Compatibilidade legado em `providers-service` para `models.providers.<provider>.apiKey` (somente leitura/fallback).
  - Metricas de rollout/hardening adicionadas:
    - `provider_credential_upsert_total`
    - `provider_credential_test_total`
    - `provider_models_discovery_fail_total`
  - Auditoria para mutate/test (`providers.credentials.upsert|delete|test`) sem exposicao de segredo.
  - Documentacao operacional atualizada:
    - `.context/docs/tooling.md`
    - `.context/docs/faq-enterprise-ops.md`
    - `.context/docs/config-console-guide.md`

- Validacao:
  - `pnpm tsgo` -> OK
  - `pnpm vitest run src/gateway/server-methods/providers.test.ts` -> OK (34/34)
  - `pnpm --dir ui test src/ui/controllers/providers.test.ts` -> OK (5/5)
