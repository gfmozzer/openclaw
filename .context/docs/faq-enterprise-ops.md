---
type: doc
name: faq-enterprise-ops
description: FAQ operacional para stack enterprise e swarm de agentes
category: operations
generated: 2026-02-21
status: filled
scaffoldVersion: "2.0.0"
---

# FAQ Enterprise Ops

## 1) Onde configuro modelo e token?
- Token do gateway: `OPENCLAW_GATEWAY_TOKEN`.
- Chaves de LLM: variaveis `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` (ou equivalentes).
- Override por requisicao: `chat.send.params.overrides` (`provider`, `model`, `systemPrompt`, `soul`, `apiKey`, `authProfileId`).
- `apiKey` e `authProfileId` por requisicao exigem escopo `operator.admin`.

## 2) Como criar subagente/worker e vincular no swarm?
- Criar time via `swarm.team.upsert` com:
  - `tenantId`
  - `teamId`
  - `supervisorAgentId`
  - lista de `workers`
- Consultar com `swarm.team.list` / `swarm.team.get`.
- Remover com `swarm.team.delete`.

## 3) Como o supervisor agenda para workers?
- `cron.add` com modo temporal habilitado (`OPENCLAW_CRON_ORCHESTRATION_MODE=temporal`).
- Politica:
  - supervisor pode agendar para si e para workers do proprio time;
  - worker agenda apenas para si;
  - cross-tenant e negado.

## 4) Como conectar WhatsApp/Telegram/Slack?
- Habilite os canais com os tokens/env corretos:
  - `TELEGRAM_BOT_TOKEN`
  - `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN`
  - WhatsApp web segue fluxo de login/pareamento do canal web.
- Em ambiente de teste backend, se `OPENCLAW_SKIP_CHANNELS=1`, canais ficam desativados.

## 5) A autenticacao funciona nos canais?
- Sim no gateway/RPC.
- Para canais, a identidade do solicitante vem do contexto do canal e entra no `tenantContext`.
- Autorizacao final (escopo/papel/tenant) e aplicada no backend.

## 6) Como evitar hardcode de credenciais?
- Use `.env`/secret manager para tudo (gateway, LLM, Redis, S3, Temporal, ToolBus).
- Nao salvar segredo em codigo, seed, docs ou prompt fixo.

## 7) Como funciona memoria em instalacao distribuida?
- Com backend stateless (`s3`/`prisma`) + Redis, o estado nao depende do disco local.
- Em `prisma`, o historico/sessao e persistido em store central.
- Em fallback legado, ainda pode existir leitura de transcript local.

## 8) Como isolar permissao por perfil (ex.: vendas x financeiro)?
- Definir papeis e escopos por operador/agente.
- Swarm por dominio (times diferentes por area).
- Bloquear ferramentas sensiveis para perfis sem escopo.
- Garantir tenant correto no `connect` + politicas enterprise.

## 9) Como habilitar callback async seguro?
- Defina `OPENCLAW_TEMPORAL_CALLBACK_SECRET`.
- Callback deve enviar assinatura HMAC valida + timestamp + nonce.
- Replay/assinatura invalida sao rejeitados.

## 10) Frontend desacoplado consegue conectar em HTTPS + WS?
- Sim, desde que o reverse proxy preserve upgrade de WebSocket e headers auth.
- O frontend deve apontar para URL do gateway com token valido.

## 11) Credencial valida mas nao aparecem modelos. O que verificar?
- Primeiro rode `providers.credentials.test` para o `profileId`.
- Se `ok=false` e `errorCode=NO_MODELS`, valide:
  - provider/baseUrl correto;
  - permissao da API key para listagem de modelos;
  - se o provider suporta discovery live.
- Se o provider nao suportar discovery live, o sistema usa catalogo built-in.

## 12) Como fazer rollback rapido da nova UX de provider/model?
- Backend: `OPENCLAW_PROVIDERS_RPC_ENABLED=0` desativa metodos `providers.*`.
- Frontend: `VITE_OPENCLAW_PROVIDERS_UI_ENABLED=0` remove a aba `Providers`.
- O fluxo legado (`/config` raw + `models.providers.*`) continua disponivel.
