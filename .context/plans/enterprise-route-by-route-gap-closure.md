---
status: in_progress
owner: codex
updated: 2026-02-22
scope: frontend-backend-gap-map
---

# Enterprise Route-by-Route Gap Closure Plan

## 0) Resposta direta: conexao de canais hoje

### WhatsApp
- UI: `Channels -> WhatsApp -> Show QR` e depois `Wait for scan`.
- RPCs usados: `web.login.start` e `web.login.wait`.
- CLI alternativa: `openclaw channels login --channel whatsapp`.

### Telegram
- Nao usa QR.
- Configure token do bot em config (canal Telegram) ou via CLI:
  - `openclaw channels add --channel telegram --token <BOT_TOKEN>`
- Depois rode probe/status no painel de `Channels`.

## 1) Objetivo deste plano

Mapear, rota por rota e submenu por submenu, o que ainda faz sentido para o produto enterprise (multi-tenant, swarm supervisor/worker, Temporal + Redis + S3 + DB) e definir um backlog executavel sem pendencias.

Criticos do contexto atual:
- Produto saiu de "assistente pessoal" para "plataforma corporativa".
- Parte do backend enterprise ja existe, mas o frontend ainda mistura UX de operacao local com UX enterprise.
- Existem telas que ainda sao placeholder (principalmente `Agents > Memory` e `Agents > Metrics`).

## 2) Inventario de rotas (estado atual)

Rotas principais (`ui/src/ui/navigation.ts`):
- `/chat`
- `/overview`
- `/channels`
- `/instances`
- `/sessions`
- `/usage`
- `/cron`
- `/agents`
- `/skills`
- `/nodes`
- `/config`
- `/debug`
- `/logs`

Submenus em `Agents` (`ui/src/ui/views/agents.ts`):
- `overview`
- `files`
- `memory`
- `metrics`
- `swarm`
- `tools`
- `skills`
- `channels`
- `cron`

## 3) Matriz rota/submenu -> fit enterprise

Legenda:
- Fit: `KEEP` (manter), `ADAPT` (manter com mudancas), `HIDE` (ocultar do portal cliente)
- Prioridade: `P0` critico, `P1` alto, `P2` medio

| Rota/Submenu | Opcoes atuais (resumo) | Fit | Gap Frontend | Gap Backend | Prioridade |
| --- | --- | --- | --- | --- | --- |
| `/chat` | chat realtime, anexos, queue local UI, foco | ADAPT | nao consome `chat.portal.contract`; sem renderer de blocos `dashboard/chart/table/actions`; sem modo "cliente" por perfil | contrato portal existe, mas sem payload persistido/validado por permissoes de visualizacao por widget | P0 |
| `/overview` | gateway URL/token/sessao/language | ADAPT | muito tecnico para cliente final; falta resumo de tenant, stack e agentes do time | precisa endpoint agregador de tenant/team/capabilities | P1 |
| `/channels` | cards WhatsApp/Telegram/etc, config por canal | ADAPT | UX ainda operador-tecnico; falta wizard por canal e checklists enterprise | falta endpoint de readiness por canal + health consolidado por tenant | P1 |
| `/instances` | lista de presenca de instancias/nodes | ADAPT | nao mostra conceito supervisor/worker/time de swarm | falta vinculo de presence com swarm team directory | P2 |
| `/sessions` | lista/patch/delete sessao | HIDE (cliente) / ADAPT (admin) | linguagem tecnica; sem filtro por tenant-role de negocio | garantir que consultas sejam sempre escopadas por tenant/principal | P1 |
| `/usage` | dashboards de tokens/custo/sessoes | ADAPT | bom para admin, mas falta visao executiva por area/time | endpoint de agregacao por team/scope/rbac | P2 |
| `/cron` | scheduler local + jobs + run history | ADAPT (virar Jobs) | nomenclatura "cron" conflita com estrategia Temporal; campos ainda misturam modo local | manter compat via `cron.*`, mas expor semanticamente como workflows/jobs; modo local deve ser bloqueado em enterprise | P0 |
| `/agents` > `overview` | identidade, modelo, config basica | ADAPT | faltam campos enterprise (papel do agente, time, capacidade de delegacao) | persistir metadata de papel supervisor/worker no backend | P1 |
| `/agents` > `files` | editar arquivos do agente | ADAPT | util para admin; perigoso para portal cliente | controles de permissao finos por role/scope | P2 |
| `/agents` > `memory` | UI placeholder (S3/JSONB sem dados reais) | ADAPT | tela nao funcional | faltam RPCs de memory browse/query/retention por tenant/agent/session | P0 |
| `/agents` > `metrics` | valores hardcoded (invocations/tokens/cost) | ADAPT | tela fake/hardcoded | faltam RPCs reais de metricas por agente e janela temporal | P0 |
| `/agents` > `tools` | profile + toggles por tool | KEEP | boa base, mas sem catalogo de tools externas por contrato | falta cadastro governado de tool externa (endpoint/auth/schema/policy) | P1 |
| `/agents` > `skills` | allowlist por agente + status | ADAPT | falta UX para skill externa (sync/async/callback) | falta registry persistente de skills externas e politicas por tenant | P1 |
| `/agents` > `channels` | snapshot de canais no contexto do agente | ADAPT | view passiva; sem bind de agente para canal/account | faltam bindings agente<->canal/account com controle por tenant | P2 |
| `/agents` > `cron` | jobs do agente | ADAPT | deve convergir para "Jobs/Temporal" | backend ja suporta modo temporal; falta sinalizar modo ativo no payload UI | P1 |
| `/agents` > `swarm` | CRUD time com identity manual (tenant/requester/role/scopes digitados) | ADAPT | identity manual e ruim para UX/producao; precisa wizard de equipe | backend ok para CRUD, mas precisa fontes confiaveis de identidade no UI sem digitacao manual | P0 |
| `/skills` | skill catalog global + install/update | ADAPT | sem fluxo de skill externa (webhook/n8n/api) end-to-end | falta API para registrar/testar skill externa com contrato | P0 |
| `/nodes` | pairing, tokens de device, exec approvals | KEEP (admin) | bom para operacao, mas sem separacao clara admin x cliente | reforcar scope gating para evitar exposicao no portal cliente | P1 |
| `/config` | editor completo de config | HIDE (cliente) / KEEP (admin) | excesso de complexidade no portal; precisa "advanced mode" | separar config publica (tenant-safe) vs config operador (infra) | P1 |
| `/debug` | snapshots + manual RPC | HIDE (cliente) / KEEP (admin) | nao deve aparecer para clientes | manter apenas com scope admin | P2 |
| `/logs` | stream de logs + filtros | HIDE (cliente) / KEEP (admin) | idem debug | suporte multi-tenant-safe redaction nos logs expostos | P2 |

## 4) Gaps de backend (por dominio)

### 4.1 Scheduler e filas
- Estado: `cron.*` ja roteia para Temporal quando `OPENCLAW_CRON_ORCHESTRATION_MODE=temporal`, e callback HMAC ja existe.
- Gap:
  - UI ainda orientada a "cron local".
  - Falta endpoint consolidado para status de filas Redis/BullMQ por tipo (`qmd-update`, `memory-sync`, `tts-cleanup`).
  - Falta contrato de operacao de jobs para frontend (listar, filtrar por team, reprocessar, cancelar) sem acoplar termos de cron local.

### 4.2 Memoria e sessao distribuidas
- Estado: chat ja toca `sessionStateStore`, `memoryStore`, `idempotencyStore`; ainda usa partes do fluxo local de sessao.
- Gap:
  - Falta API de consulta de memoria para UI (`memory.list/search/get/delete/retention`).
  - Falta visao de trilha por `tenant -> agent -> session/caller` no frontend.

### 4.3 Tool bus e skills externas
- Estado: modo remoto existe (`OPENCLAW_SKILL_ADAPTER_MODE=remote`) com dispatcher HTTP.
- Gap:
  - Falta cadastro governado de ferramentas externas (nome, endpoint, auth, timeout, modo sync/async, schema de entrada/saida).
  - Falta fallback policy explicita (externa preferencial, interna fallback opcional).
  - Falta UI de teste de ferramenta externa com dry-run.

### 4.4 Swarm e RBAC
- Estado: `swarm.team.*` funcional com autorizacao enterprise e principal no request context.
- Gap:
  - UI exige preenchimento manual de identidade/scopes.
  - Falta endpoint para "directory" de agentes com papel (supervisor/worker) e capacidades.
  - Falta regra persistida de "worker agenda somente para si" exibida e auditavel no frontend.

### 4.5 Canais (WhatsApp/Telegram/Slack/...)
- Estado: WhatsApp QR e Telegram token estao ativos.
- Gap:
  - Falta wizard de onboarding enterprise por canal (validacao pre-req + health + permissao).
  - Falta FAQ in-app de operacao de canais e troubleshooting.

### 4.6 Observabilidade e operacao
- Estado: debug/logs existem.
- Gap:
  - Falta visao executiva de stack (`Temporal`, `Redis`, `S3`, `Postgres`, `channels`) no mesmo painel com semaforo.
  - Falta docs in-app de endpoints enterprise e exemplos de payload.

## 5) Plano de execucao (sem pendencias)

## Fase A - Contrato de produto e navegacao enterprise (P0)
Objetivo: separar portal cliente de console operador sem quebrar rotas atuais.

Entregas:
1. Definir `uiMode` (cliente | admin) no frontend e esconder rotas sensiveis em modo cliente (`config`, `debug`, `logs`, parte de `sessions`, parte de `nodes`).
2. Renomear experiencia de `/cron` para "Jobs" quando orchestracao temporal estiver ativa.
3. Adicionar badge global de modo de orquestracao (`temporal` vs `local`) e backend stateless (`in-memory`, `s3`, `prisma`).

Critrio pronto:
- Um usuario cliente nao visualiza superfices de operacao sensivel.
- Um operador enxerga claramente se esta em modo temporal/distribuido.

## Fase B - Fechar P0 de telas placeholder (P0)
Objetivo: eliminar views fake de memoria e metricas.

Entregas:
1. `Agents > Memory`: conectar em RPCs reais (listar escopos, listar itens, busca, retention, delete).
2. `Agents > Metrics`: remover hardcode e consumir metricas reais por agente (`tokens`, `cost`, `runs`, `latencia`, `falhas`).
3. Adicionar testes UI + testes de contrato para novos RPCs.

Critrio pronto:
- Nenhum dado hardcoded nas duas telas.
- Todos os dados vem de RPC e respeitam tenant/scope.

## Fase C - Jobs enterprise (Temporal + BullMQ) (P0)
Objetivo: consolidar narrativa de jobs assicronos.

Entregas:
1. Evoluir `/cron` para `/jobs` (sem quebrar path legado inicialmente; alias).
2. Exibir tipo de job (`workflow temporal`, `queue short-lived`) e estado.
3. Expor controles permitidos por papel:
   - supervisor: agendar para equipe e para si
   - worker: agendar apenas para si
4. Painel de filas Redis/BullMQ com backlog, retries, dead-letter (se houver).

Critrio pronto:
- Nao existe ambiguidade entre cron local e temporal no frontend enterprise.

## Fase D - Skills externas first-class (P0/P1)
Objetivo: ferramenta externa como objeto de produto, nao apenas env var.

Entregas:
1. Cadastro de tool externa por tenant:
   - nome, endpoint, auth strategy, timeout, modo (`sync`/`async`), callback settings
2. Politica por agente: `preferExternal`, `fallbackInternal`, `denyInternal`.
3. Tela de teste (request/response, erro, latencia, audit id).

Critrio pronto:
- Operador consegue registrar e validar skill externa sem editar arquivo manualmente.

## Fase E - Swarm UX enterprise (P0/P1)
Objetivo: swarm configuravel sem digitacao manual de identidade.

Entregas:
1. Em `Agents > Swarm`, remover campos manuais de `tenant/requester/role/scopes` e usar identidade autenticada da sessao.
2. Wizard de time:
   - selecionar supervisor
   - selecionar workers
   - definir especialidades
   - definir escopos permitidos
3. Exibir regras de autorizacao efetivas do time (quem pode agendar o que).

Critrio pronto:
- Configurar time completo sem preencher identidade manual.

## Fase F - Canais + FAQ in-app + docs de API (P1)
Objetivo: reduzir lacuna operacional.

Entregas:
1. Wizard de onboarding por canal (WhatsApp, Telegram, Slack, etc).
2. Pagina `/docs` in-app com endpoints enterprise (exemplos de request/response).
3. Pagina `/faq` in-app cobrindo:
   - conectar canal
   - autenticar
   - criar worker
   - atrelar worker ao swarm
   - troubleshooting de websocket/token.

Critrio pronto:
- Um operador novo consegue subir e operar sem consultar codigo-fonte.

## 6) Dependencias entre fases

- A (navegacao enterprise) desbloqueia B, C, D, E.
- B (memory/metrics reais) depende de RPCs backend correspondentes.
- C (jobs) depende de contratos prontos no backend para status de orchestracao e filas.
- D (skills externas) depende de contrato backend para registry e politica.
- E (swarm UX) depende de principal/autenticacao consolidada no frontend.
- F pode rodar em paralelo com C/D/E apos A.

## 7) Ordem recomendada de implementacao

1. Fase A
2. Fase B + Fase C (em paralelo parcial)
3. Fase D + Fase E (em paralelo parcial)
4. Fase F (docs/faq/wizards finais)

## 8) Riscos e mitigacoes

- Risco: quebrar fluxo legado de cron local.
  - Mitigacao: manter alias de metodo/path e feature flag de UI.
- Risco: expor superfice admin a usuario cliente.
  - Mitigacao: `uiMode` + scope checks server-side em toda rota sensivel.
- Risco: skill externa sem observabilidade.
  - Mitigacao: audit/event id obrigatorio para cada execucao externa.

## 9) Checklist de aceite final

- [ ] Nenhuma tela enterprise critica usa dado hardcoded.
- [ ] Portal cliente e console admin estao separados por modo/perfil.
- [ ] Jobs Temporal e filas Redis estao claros no frontend.
- [ ] Swarm configurado sem identidade manual digitada.
- [ ] Skills externas cadastraveis e testaveis pela UI.
- [ ] FAQ e docs in-app cobrindo operacao do dia a dia.
- [ ] Todos os fluxos respeitam tenant + scope no backend.
