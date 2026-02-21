---
status: filled
generated: 2026-02-21
title: "Enterprise Security and Stateless Core"
owner: "security-auditor"
---

# Enterprise Security and Stateless Core

> Plano tatico para fechar C0-01, C0-02, C0-03, C0-04, C1-05, C1-06 e C1-07.

## Objetivo
Garantir seguranca de identidade/autorizacao e execucao stateless distribuida real no core do gateway.

## Entregas obrigatorias
1. `EnterprisePrincipal` server-side unico no request context.
2. Callback async autenticado e correlacionado com estado persistido.
3. Runtime principal sem dependencia de disco local para sessao/memoria/idempotencia.
4. Prisma/RLS efetivo por request/transacao.
5. Swarm store persistente distribuido.
6. Redis integrado no fluxo real.
7. Estrategia Temporal formalizada e executada.

## Fases

### Fase 1 - Identity Trust Boundary
1. Criar modulo `principal-resolver` para mapear identidade autenticada em `GatewayRequestContext`.
2. Remover uso de `tenantId/requesterId/role/scopes` vindo de payload em:
   - `swarm.*`
   - `cron.*`
   - `toolbus` e caminhos de escrita no `chat.*`
3. Introduzir erro padrao para violacao de principal (`UNAUTHORIZED_SCOPE`, `TENANT_MISMATCH`).
4. Testes:
   - payload forged tenant
   - scope escalation attempt
   - supervisor/worker matrix

### Fase 2 - Async Callback Hardening
1. Definir credencial de servico para callback (`OPENCLAW_TEMPORAL_CALLBACK_SECRET` / JWT service key).
2. Validar assinatura + timestamp + nonce para proteger replay.
3. Validar correlacao (`workflowId`, `correlationId`, `tenantId`, `agentId`) em store duravel antes de aceitar resume.
4. Rejeitar callback para job inexistente/estado invalido.
5. Auditar aceites e rejeicoes em `AuditEventStore`.
6. Testes:
   - callback sem assinatura
   - callback com assinatura invalida
   - replay attack
   - correlacao cruzada entre tenants

### Fase 3 - Stateless Runtime E2E
1. Substituir leituras/escritas locais de sessao/transcript por `SessionStateStore` e `MemoryStore`.
2. Integrar `IdempotencyStore` distribuido no fluxo de `chat.send` e eventos assíncronos.
3. Integrar `messageBus` distribuido para sinais/coordenação entre replicas.
4. Validar restart de replica sem perda de continuidade da sessao.

### Fase 4 - Prisma/RLS e stores distribuidos
1. Garantir `withTenantScope` em 100% das operacoes multi-tenant Prisma.
2. Revisar e migrar stores restantes para Prisma:
   - swarm directory
   - scheduler tracker state
   - overrides/audit
3. Garantir caminho de fallback controlado por feature flags.
4. Testes cross-tenant com dois tenants reais em banco local.

### Fase 5 - Redis + Temporal strategy closure
1. Confirmar `redis` dependency e healthcheck.
2. Conectar lock/idempotencia/fila aos fluxos reais (nao apenas adapter).
3. Escolher e documentar estrategia Temporal:
   - A) bridge hardenizada com contrato v1
   - B) SDK direto no core
4. Implementar opcao escolhida com telemetria, retry e DLQ operacional.

## Definition of Done
1. `rg` nao encontra decisao de auth baseada em identity de payload.
2. Testes de callback security passando com cobertura.
3. `chat.send` funciona com stores distribuidos e sem arquivo local.
4. RLS bloqueia cross-tenant em testes de integracao.
5. Scheduler/swarm persistem em reinicio de gateway.

## Comandos de verificacao
1. `pnpm vitest run src/gateway/stateless/enterprise-authorization.test.ts`
2. `pnpm vitest run src/gateway/stateless/cross-tenant-isolation.test.ts`
3. `pnpm vitest run src/gateway/server-methods/cron*.test.ts`
4. `pnpm vitest run src/gateway/server-methods/swarm*.test.ts`
5. `pnpm tsgo`
6. `pnpm build`

## Riscos e mitigacao
1. Risco: regressao em canais legados.
   - Mitigacao: feature flags por modulo + suite de smoke por canal.
2. Risco: latencia extra por validacao de callback.
   - Mitigacao: cache de nonce curto + validação O(1) em Redis.
3. Risco: drift entre adapter Temporal e orchestrator externo.
   - Mitigacao: contrato versionado + test harness de compatibilidade.
