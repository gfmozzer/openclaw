---
title: "Enterprise Runtime Plan 5: Swarm Worker Presence And Control UI"
status: pending
priority: HIGH
parallelizable: partial
updated: 2026-02-23
owner: "frontend-control-ui"
---

# Plan 5: Swarm Worker Presence And Control UI

## Objetivo

Completar a experiência operacional no painel de Swarm para que o operador consiga:

- atachar/configurar workers em times (já existe parcialmente)
- verificar se o worker está **online/alcancável** no swarm
- validar delegação (`admin/supervisor -> worker`)
- disparar invocação direta de worker (quando o backend `swarm.worker.invoke` estiver disponível)

## Contexto (estado atual)

Já existe no frontend:
- painel de swarm em `Agents > Swarm`
- CRUD de times e workers (`swarm.team.*`)
- inventário de runtime/catálogo local (drivers/providers/models) por instância

Já existe no backend:
- `swarm.worker.validate` (validação de delegação)

Gap atual:
- sem indicador de presença/online por worker
- sem ação de “testar worker / invoke worker”
- sem polling/estado de execução de tarefas delegadas

## Escopo (inclui)

- status visual por worker (online / offline / unknown)
- botão “Validar” e “Testar/Invocar” worker no painel de swarm
- integração com `swarm.worker.validate`
- integração com `swarm.worker.invoke` (Plan 4)
- feedback de execução (`inline` vs async refs)

## Fora de escopo

- dashboard avançado de filas/Temporal por worker (outra tela)
- editor de skills/tools por worker (fora do painel swarm)
- observabilidade histórica completa

## Dependências

- **Plan 4 / Fase 1**: contrato `swarm.worker.invoke` congelado
- **Plan 4 / Fase 2**: handler backend funcional para teste real

## Contratos UI (a consumir)

### Já disponível
- `swarm.team.list`
- `swarm.team.upsert`
- `swarm.team.delete`
- `swarm.worker.validate`

### Novo (Plan 4)
- `swarm.worker.invoke`
- `swarm.worker.invoke.status` (ou equivalente definido no Plan 4)

### Presença / online (definir no backend, se não houver endpoint reutilizável)
Opções:
1. `swarm.worker.presence.list` (preferível para UI)
2. reutilizar `node.list` + mapping local de agent/container (mais frágil)
3. `chat.portal.stack.status` por instância (não resolve por worker do swarm distribuído)

Recomendação:
- criar `swarm.worker.presence.list` com payload simples (tenant/team/workers -> status)

## Arquivos alvo (must touch)

### UI Controller / View
- `ui/src/ui/controllers/swarm.ts`
- `ui/src/ui/views/agents-panels-swarm.ts`
- `ui/src/ui/views/agents.ts` (se precisar de wiring extra)

### Tipos / client state (se necessário)
- `ui/src/ui/types.ts`
- `ui/src/ui/app-state.ts` / `ui/src/ui/app-view-state.ts` (apenas se exigir estado global)

### i18n
- `ui/src/i18n/locales/pt-BR.ts`
- `ui/src/i18n/locales/en.ts`

### Testes UI (must)
- `ui/src/ui/views/agents-panels-swarm.test.ts` (novo, se não existir)
- `ui/src/ui/controllers/swarm.test.ts` (novo, se não existir)

### Backend (se presença ganhar endpoint novo)
- `src/gateway/server-methods/swarm.ts`
- `src/gateway/server-methods.ts`
- `src/gateway/server-methods-list.ts`
- `src/gateway/method-scopes.ts`
- `src/gateway/protocol/schema/*` (schema de presença)

## Fases

### Fase 1 - UX Contract + Presence Strategy
1. Definir fonte de verdade de presença (`swarm.worker.presence.list` recomendado)
2. Congelar estados visuais:
   - `online`
   - `offline`
   - `unknown`
   - `degraded` (opcional)
3. Definir ações por worker:
   - `Validar`
   - `Invocar teste`
   - `Refresh presença`

Entregável:
- contrato UI/backend + layout de estados

### Fase 2 - Implementação UI (com feature detection)
1. Adicionar coluna/chips de presença por worker
2. Integrar `swarm.worker.validate`
3. Integrar `swarm.worker.invoke` (quando disponível)
4. Mostrar resultado:
   - `inline`: output curto
   - `async`: `taskId/jobRef/workflowRef`
5. Feature detection:
   - se RPC novo não existir, UI mostra “backend não atualizado”

Entregável:
- painel funcional sem quebrar ambientes antigos

### Fase 3 - Docs + Runbook
1. Atualizar `/docs` e `/faq` com seção de swarm worker test/invoke
2. Documentar como interpretar `online` vs `valid delegation`
3. Documentar limitação: presença de worker != saúde da skill interna

## Critérios de aceite

- operador consegue atachar worker (já existente) e ver status de presença/online no painel
- operador consegue validar delegação por worker via UI
- operador consegue disparar invoke de teste (quando backend disponível)
- UI não quebra quando backend ainda não tiver RPC novo (degradação graciosa)

## Paralelização

- Pode começar em paralelo com Plan 4 após congelar contratos (Fase 1)
- Implementação final depende do backend (`swarm.worker.invoke`)

