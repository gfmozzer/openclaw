# Plan 2: Execution Routing Matrix

> Matriz de decisão de execução para roteamento entre inline, Redis/BullMQ e Temporal.
> 
> **Status:** Fase 1 completa (contracts definidos)  
> **Data:** 2026-02-23  
> **Depende de:** Plan 0 (contracts base)  

---

## TaskClass Classification

| TaskClass | Descrição | Duração Típica | Persistência | Retry | Resume | Modo Padrão |
|-----------|-----------|----------------|--------------|-------|--------|-------------|
| `inline_sync` | Tarefa curta síncrona | 0-30s | ❌ Não | ❌ Não | ❌ Não | `inline` |
| `ephemeral_async` | Tarefa async de curto prazo | 1s-5min | ❌ Não | ✅ Sim | ❌ Não | `redis_ephemeral` |
| `durable_async` | Tarefa longa/durável | 30s-24h | ✅ Sim | ✅ Sim | ✅ Sim | `temporal_workflow` |
| `scheduled` | Tarefa agendada | Variável | ✅ Sim | ✅ Sim | ✅ Sim | `temporal_workflow` |
| `human_approval` | Requer aprovação humana | 1min-7dias | ✅ Sim | ❌ Não | ✅ Sim | `temporal_workflow` |

---

## Matriz de Decisão de Execução

### Inputs Considerados

```typescript
ExecutionRoutingPolicyInput {
  taskType: string;           // Tipo da tarefa
  taskClass: TaskClass;       // Classificação
  requestSource: RequestSource; // Fonte da requisição
  timeoutBudgetMs: number;    // Budget de timeout
  isIdempotent: boolean;      // Se é idempotente
  canRetry: boolean;          // Se pode retry
  requiresResume: boolean;    // Se precisa de resume
  tenantId: string;           // Tenant
  priority?: number;          // Prioridade
  tenantPolicyHints?: {       // Hints do tenant
    preferExecutionMode?: ExecutionDecisionMode;
    forceExecutionMode?: ExecutionDecisionMode;
  };
}
```

### Fluxo de Decisão

```
┌─────────────────────────────────────────────────────────────┐
│                    START: Nova Tarefa                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Classificar TaskClass                                     │
│    - hasHumanInTheLoop? → human_approval                    │
│    - scheduleKind != immediate? → scheduled                 │
│    - requiresResume/callback? → durable_async               │
│    - estimatedDurationMs > 5min? → durable_async            │
│    - estimatedDurationMs > 30s? → ephemeral_async           │
│    - default → inline_sync                                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Verificar Tenant Override                                 │
│    - forceExecutionMode definido? → Usar modo forçado       │
│    - Modo forçado indisponível? → Fallback                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Mapear TaskClass → Modo                                   │
│    - inline_sync → inline                                   │
│    - ephemeral_async → redis_ephemeral                      │
│    - durable_async → temporal_workflow                      │
│    - scheduled → temporal_workflow                          │
│    - human_approval → temporal_workflow                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Verificar Disponibilidade                                 │
│    - Modo disponível? → Usar modo mapeado                   │
│    - Modo indisponível? → Fallback chain                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Gerar ExecutionDecision                                   │
│    { mode, reason, priority, queue?, workflowType? }        │
└─────────────────────────────────────────────────────────────┘
```

---

## Hierarquia de Fallback

Quando o modo preferido está indisponível:

```
inline → redis_ephemeral → temporal_workflow

Exemplos:
- inline indisponível → tenta redis_ephemeral → tenta temporal_workflow
- redis_ephemeral indisponível → tenta temporal_workflow
- temporal_workflow indisponível → usa inline (emergency fallback)
```

---

## DelegationPolicy: Regras por Role

### Supervisor

| Ação | Permissão | Restrições |
|------|-----------|------------|
| Delegar para worker | ✅ Sim | Worker deve estar no mesmo team |
| Agendar para self | ✅ Sim | - |
| Agendar para team | ✅ Sim | - |
| Team membership check | ✅ Sim | Obrigatório (exceto admin) |

### Worker

| Ação | Permissão | Restrições |
|------|-----------|------------|
| Delegar para outro worker | ❌ Não | Workers não podem delegar |
| Agendar para self | ✅ Sim | Apenas self |
| Agendar para team | ❌ Não | - |

### Admin

| Ação | Permissão | Restrições |
|------|-----------|------------|
| Delegar para worker | ✅ Sim | Cross-team permitido |
| Agendar para self | ✅ Sim | - |
| Agendar para team | ✅ Sim | - |
| Team membership check | ❌ Não | Não aplicável |

---

## InternalWorkerInvocationContract

### Métodos de Invocação

| Método | Quando Usar | Parâmetros Principais |
|--------|-------------|----------------------|
| `sync_invoke` | Modo `inline` | timeoutMs, payload, delegationContext |
| `async_enqueue` | Modo `redis_ephemeral` | queueConfig (name, priority, delay), payload |
| `schedule` | Modo `temporal_workflow` | schedule (immediate/at/cron), workflowConfig |
| `callback` | Resume workflow | workflowRef, status, output/error |

### Worker Config

Cada worker pode ter configuração própria de provider/modelo:

```typescript
InternalWorkerConfig {
  agentId: string;
  tenantId: string;
  providerConfig: {
    provider: string;      // Ex: "openai", "anthropic"
    model: string;         // Ex: "gpt-4", "claude-3"
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  };
  enabledSkills: string[];
  executionConstraints?: {
    maxConcurrentTasks?: number;
    maxTaskDurationMs?: number;
    allowedExecutionModes?: ExecutionDecisionMode[];
  };
}
```

---

## Erros Canônicos (Plan 2)

### Delegation Errors

| Código | Descrição | HTTP Status Sugerido |
|--------|-----------|---------------------|
| `DELEGATION_DENIED` | Delegação não permitida | 403 |
| `WORKER_NOT_IN_TEAM` | Worker não está no team do supervisor | 403 |
| `WORKER_CANNOT_DELEGATE` | Workers não podem delegar para outros | 403 |
| `SCHEDULE_TEAM_DENIED` | Role não pode agendar para team | 403 |
| `INSUFFICIENT_SCOPES` | Delegator não tem scopes necessários | 403 |
| `TARGET_ROLE_INVALID` | Role do target inválido | 400 |
| `CROSS_TENANT_DELEGATION_FORBIDDEN` | Cross-tenant não permitido | 403 |

### Execution Errors

| Código | Descrição | HTTP Status Sugerido |
|--------|-----------|---------------------|
| `EXECUTION_MODE_UNAVAILABLE` | Modo de execução indisponível | 503 |
| `WORKER_UNAVAILABLE` | Worker não está disponível | 503 |
| `WORKER_NOT_FOUND` | Worker não encontrado | 404 |
| `EXECUTION_TIMEOUT` | Timeout na execução | 504 |
| `RATE_LIMITED` | Rate limit atingido | 429 |
| `QUEUE_FULL` | Fila cheia | 503 |

### Workflow Errors

| Código | Descrição | HTTP Status Sugerido |
|--------|-----------|---------------------|
| `WORKFLOW_NOT_FOUND` | Workflow não encontrado | 404 |
| `INVALID_DELEGATION_CONTEXT` | Contexto de delegação inválido | 400 |
| `SKILL_NOT_ALLOWED` | Skill não permitida para worker | 403 |
| `PROVIDER_CONFIG_MISSING` | Configuração de provider ausente | 500 |
| `INTERNAL_ERROR` | Erro interno | 500 |

---

## Exemplos de ExecutionDecision

### Exemplo 1: Tarefa Inline

```typescript
// Input: taskClass = "inline_sync", requestSource = "channel_direct"
{
  mode: "inline",
  reason: "TaskClass inline_sync -> inline",
  priority: 5
}
```

### Exemplo 2: Tarefa Ephemeral

```typescript
// Input: taskClass = "ephemeral_async", requestSource = "internal_supervisor"
{
  mode: "redis_ephemeral",
  queue: "ephemeral:tenant-123",
  reason: "TaskClass ephemeral_async -> redis_ephemeral",
  priority: 3
}
```

### Exemplo 3: Tarefa Durável

```typescript
// Input: taskClass = "durable_async", requestSource = "trusted_frontdoor_api"
{
  mode: "temporal_workflow",
  workflowType: "generate-report",
  reason: "TaskClass durable_async -> temporal_workflow",
  priority: 7,
  retryPolicyRef: "default-retry"
}
```

### Exemplo 4: Fallback

```typescript
// Input: taskClass = "ephemeral_async", mas Redis indisponível
{
  mode: "temporal_workflow",
  workflowType: "default-worker-task",
  reason: "Fallback from redis_ephemeral (unavailable) to temporal_workflow",
  priority: 3
}
```

---

## Próximos Passos (Fase 2)

1. **Backend Implementation**
   - Implementar `ExecutionRoutingPolicy` em `chat.ts`
   - Integrar com `cron.ts` para scheduling restrictions
   - Validar target worker em `swarm.ts`

2. **Integração com Infra**
   - Conectar com adaptadores Redis/BullMQ existentes
   - Integrar com Temporal workflows
   - Implementar `InternalWorkerInvoker`

3. **Observabilidade**
   - Auditoria de decisions de execução
   - Métricas de fallback
   - Tracing de delegações

---

## Contratos Criados

| Arquivo | Descrição |
|---------|-----------|
| `task-class.ts` | TaskClass, classificação e metadados |
| `execution-routing.ts` | ExecutionRoutingPolicy (estendido) |
| `delegation-policy.ts` | DelegationPolicy e regras por role |
| `internal-worker-invocation.ts` | Contratos de invocação interna |
| `enterprise-orchestration.ts` | Erros canônicos adicionados |

---

## Integração com Plan 1

Estes contratos aceitam `effectiveScopes` e `effectiveSkillAllowlist` como opcionais/stubs:

```typescript
// Em DelegationEnvelope
effectiveScopes: string[];           // Populado por Plan 1
effectiveSkillAllowlist?: string[];  // Populado por Plan 1

// Em DelegationPolicy
enforceScopeIntersection: boolean;   // Configurável
enforceSkillAllowlist: boolean;      // false até Plan 1 estar pronto
```

Hooks estão preparados para consumir Plan 1 quando disponível.
