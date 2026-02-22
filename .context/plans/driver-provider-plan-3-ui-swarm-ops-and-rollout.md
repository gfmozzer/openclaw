---
title: "Driver/Provider Plan 3: UI, Swarm Operations, and Rollout"
status: completed
priority: HIGH
parallelizable: yes
updated: 2026-02-23
owner: "frontend-enterprise"
---

# Plan 3: UI, Swarm Ops, and Rollout

## Objetivo

Expor operacao guiada no frontend para configurar `driver/provider/model` por agente.

## Escopo tecnico

1. UI de Drivers
- Nova area para:
  - listar drivers instalados/ativos
  - status de health/load
  - origem (builtin/external)

2. UI de credenciais
- Credenciais por driver/provider, com tipo correto.
- Workflow guiado:
  1. selecionar driver
  2. selecionar provider
  3. cadastrar credencial
  4. smoke test
  5. sincronizar modelos

3. Picker por agente
- Em `Agents > Overview`, escolher:
  - Driver
  - Provider
  - Model
- Dropdown pesquisavel com rotas validas.

3.1 Tool Mode no cadastro/seleção de modelo
- Em telas de modelo, adicionar flag visual:
  - `Usar como ferramenta (Tool Mode)`.
- Quando ativo:
  - coletar/mostrar contrato (`toolContract`) do modelo (inputs/outputs/timeout/capabilities);
  - disponibilizar a rota na biblioteca de tools para outros agentes.
- Quando inativo:
  - modelo opera como modelo principal/fallback de agente.
- Observação obrigatória de UX:
  - Tool Mode é "modelo como API/ferramenta", não um tipo de agente/container.
  - papéis de swarm (manager/supervisor/worker) continuam sendo apenas papéis de agentes isolados.

4. Swarm operacional
- Exibir capacidades por worker:
  - drivers habilitados
  - providers disponiveis
  - modelos prontos
- Suporte a "perfil de instalacao" por tipo de worker.

5. Rollout e docs
- FAQ/Runbook para:
  - erro de driver nao carregado
  - credencial valida sem modelos
  - modelo disponivel em mais de um driver

## Arquivos alvo (estimado)

- `ui/src/ui/views/providers.ts` (evoluir para drivers+providers)
- `ui/src/ui/controllers/providers.ts` (ou dividir por drivers)
- `ui/src/ui/views/agents.ts`
- docs em `.context/docs/*`

## Testes

1. UI
- fluxo completo sem JSON raw.
- troca de driver mantendo provider/model validos.

2. E2E
- worker com driver limitado nao permite escolha fora do perfil.

## Criterio de aceite

- Operacao diaria inteiramente guiada por UI.
- Separacao driver/provider clara para operador.
- Fluxo preparado para swarm multi-container.
- Operador consegue marcar modelo como `Tool Mode` sem editar JSON manual.

## Progresso (2026-02-23)

- Entrega inicial de UI de Drivers concluída:
  - Nova rota/aba `/drivers` adicionada ao frontend.
  - Sidebar e navegação atualizados com atalho visível.
  - Tela renderiza diagnóstico de runtime usando `chat.portal.stack.status.drivers.details`:
    - enabled / loaded / source / package / entry / reason
  - `providers-feature-flag` atualizado para aceitar backend que anuncia `drivers.*` (alias/transição).
  - i18n (`pt-BR` e `en`) atualizado.
  - `PortalStackStatus` tipado com bloco `drivers`.
  - Validação: `pnpm --dir ui build` -> OK

- Entrega incremental: fluxo guiado inicial em `/drivers`:
  - `/drivers` agora consome RPCs `drivers.*` dedicados:
    - `drivers.registry.list`
    - `drivers.providers.list`
    - `drivers.models.list`
    - `drivers.credentials.list`
    - `drivers.credentials.upsert/delete/test`
    - `drivers.smoke.test` (level=`route`)
  - Workflow já disponível na UI:
    1. selecionar driver
    2. selecionar provider do driver
    3. salvar/remover credencial no contexto `driver+provider`
    4. smoke de credencial
    5. smoke de rota (transicional, catálogo/availability)
  - Mantido painel de diagnóstico de runtime (`drivers.details`) no final da página.
  - `/providers` mantido como fallback/compatibilidade durante migração de UX.
  - Validação: `pnpm --dir ui build` -> OK

## Entrega adicional (2026-02-23) - fechamento do plano

- `/drivers` evoluída para fluxo guiado inicial:
  - seleção `driver -> provider`
  - credenciais (`drivers.credentials.*`)
  - smoke de credencial
  - smoke de rota (`drivers.smoke.test`, modo transicional)
  - botão explícito `Sync models` com feedback operacional
- `/providers` mantido como tela de compatibilidade com aviso de migração para `/drivers`
- `Agents > Overview` atualizado com:
  - picker estruturado `Driver -> Provider -> Model route`
  - campo pesquisável mantido (datalist)
  - preview de `toolMode` e `toolContract` (sem JSON manual para visualização)
- `Agents > Swarm` atualizado com:
  - inventário de runtime/catálogo da instância atual (drivers/providers/modelos/tool routes)
  - apoio operacional para perfil de instalação por worker/container
- Documentação final da trilha UI:
  - `.context/docs/driver-provider-ui-rollout-guide.md`

## Follow-ups pós-Plan 3 (não bloqueiam encerramento)

1. Unificação completa `/providers` + `/drivers` (reduzir duplicidade visual/fluxo).
2. E2E de escolha por worker com perfil de runtime por container real.
3. Editor dedicado de `toolContract` (hoje há preview/UI de seleção; autoria continua via config/catalog sources).
4. Smoke de rota com inferência real (dependente da evolução do runtime/adapters, fora do escopo do Plan 3).
