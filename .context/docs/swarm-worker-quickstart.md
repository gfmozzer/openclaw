---
type: doc
name: swarm-worker-quickstart
description: Guia rapido para montar swarm de agentes e vincular workers
category: operations
generated: 2026-02-21
status: filled
scaffoldVersion: "2.0.0"
---

# Swarm Worker Quickstart

## Objetivo
Subir um supervisor com workers, validar agendamento via Temporal e confirmar isolamento por tenant.

## Pre-requisitos
1. Gateway autenticado com `OPENCLAW_GATEWAY_TOKEN`.
2. Backend stateless ativo (`OPENCLAW_STATELESS_BACKEND=prisma` recomendado).
3. Redis configurado (`OPENCLAW_REDIS_URL`).
4. Temporal bridge configurado (`OPENCLAW_CRON_ORCHESTRATION_MODE=temporal` + endpoint + callback secret).

## Passo 1: Criar o time
1. Chame `swarm.team.upsert` com:
   - `tenantId`
   - `teamId`
   - `supervisorAgentId`
   - `workers[]` (cada worker com `agentId` e especialidades opcionais)
2. Confirme com `swarm.team.get` e `swarm.team.list`.

## Passo 2: Validar politica supervisor/worker
1. Como supervisor, execute `cron.add` para um worker do mesmo time: deve aceitar.
2. Como worker, execute `cron.add` para outro worker: deve negar.
3. Como worker, execute `cron.add` para si mesmo: deve aceitar.

## Passo 3: Testar callback/resume async
1. Dispare job assincrono com `cron.add`.
2. Entregue callback assinado em `cron.callback`.
3. Verifique que o resume chega no alvo correto (`tenantId` + `agentId` + correlacao).

## Passo 4: Testar resiliencia multi-replica
1. Inicie uma sessao no replica A.
2. Continue no replica B com mesma chave de sessao.
3. Confirme continuidade da conversa e idempotencia.

## Check operacional
1. `health` OK.
2. `system.metrics` sem explosao de `auth_denied_total` e `idempotency_lock_failures_total`.
3. `swarm.team.list` retorna times persistidos apos restart.
4. Jobs existentes continuam rastreaveis apos restart.
