---
type: doc
name: trusted-frontdoor-overrides-guide
description: Guia de integração para API trusted frontdoor, overrides por request e fallback seguro
category: integration
generated: 2026-02-23
status: filled
scaffoldVersion: "2.0.0"
---

# Trusted Frontdoor Overrides Guide

## Objetivo

Documentar como integrar um frontend/CRM/API própria (frontdoor) com o OpenClaw para:
- identificar usuário corporativo antes de chamar o bot
- aplicar overrides por request de forma segura
- usar fallback automático (patch parcial)
- parametrizar custo/latência (ex.: `optimizationMode=economy`) sem hardcode no core

## Conceito-chave

O OpenClaw recebe um **request patch parcial**. O que vier no override é aplicado se permitido.
O que **não** vier usa fallback dos defaults/configuração do agente/instância.

Ordem de resolução (resumo):
1. defaults da instância/container
2. config do agente
3. contexto de sessão (quando aplicável)
4. override da requisição (campos permitidos)

## Fluxo recomendado (enterprise)

```
Canal/Webhook (WhatsApp/Telegram/etc)
  ->
Sua API / CRM (trusted frontdoor)
  -> resolve identidade corporativa + role + entitlements
  -> monta requestContext + overrides
  ->
OpenClaw Gateway (chat.send)
  -> valida origem/claims
  -> aplica policy por campo
  -> merge + fallback
  ->
Agente / Worker / Provider
```

## O que enviar em `chat.send`

### Estrutura recomendada (campos relevantes)

```json
{
  "sessionKey": "tenant-a:user-123",
  "message": "Quero um resumo de vendas da semana",
  "idempotencyKey": "req-2026-02-23-0001",
  "requestContext": {
    "requestSource": "trusted_frontdoor_api",
    "trustedFrontdoor": {
      "frontdoorId": "crm-main",
      "claims": {
        "tenantId": "tenant-a",
        "principalId": "user-123",
        "requestId": "crm-req-abc",
        "issuedAt": 1760000000000,
        "expiresAt": 1760000060000,
        "allowedOverrideFields": [
          "model",
          "systemPrompt",
          "skillAllowlist",
          "optimizationMode",
          "contextPolicy",
          "routingHints",
          "budgetPolicyRef"
        ]
      }
    }
  },
  "overrides": {
    "model": "openai/gpt-4o-mini",
    "systemPrompt": "Atenda como analista comercial, respostas objetivas.",
    "skillAllowlist": ["sales_report", "dashboard_render"],
    "optimizationMode": "economy",
    "contextPolicy": "lean",
    "routingHints": {
      "preferCheap": true,
      "preferFast": true,
      "allowEscalation": true,
      "escalationThreshold": 6
    },
    "budgetPolicyRef": "tenant-a-daily-budget"
  }
}
```

## Regras atuais de policy (baseline)

### `channel_direct`
Por padrão, o gateway bloqueia overrides sensíveis/capability:
- `apiKey`
- `authProfileId`
- `skillAllowlist`
- `optimizationMode`
- `contextPolicy`
- `routingHints`
- `budgetPolicyRef`

Observação:
- `provider/model/systemPrompt/soul` podem evoluir por policy futura, mas hoje a baseline segura é restritiva para canal bruto.

### `trusted_frontdoor_api`
- Pode enviar overrides, mas o gateway pode filtrar por `claims.allowedOverrideFields`.
- Claims expirados são rejeitados.
- Claims sem validade/sanitização adequada podem ser rejeitados.

## `reject request` vs `reject field`

O gateway usa duas estratégias:

### `reject request` (bloqueio total)
Usado quando o risco é alto.
Exemplo atual:
- `apiKey` / `authProfileId` enviados por `channel_direct`

### `reject field` (degradação graciosa)
Usado quando faz sentido continuar a requisição sem o campo.
Exemplos atuais:
- `optimizationMode/contextPolicy/routingHints` vindos por `channel_direct`
- campo não listado em `allowedOverrideFields` de `trusted_frontdoor_api`

## `skillAllowlist` dinâmico (importante)

`skillAllowlist` por request **não** cria permissão nova.

Semântica pretendida:
- request pede uma lista
- policy/entitlements do principal definem o que é permitido
- defaults do agente também podem restringir
- resultado efetivo = interseção

Em outras palavras:
- override é **limitador**
- RBAC/ABAC é **fonte de permissão**

## Modo economia (`optimizationMode=economy`)

Trate `optimizationMode` como **hint/política**, não como regra fixa do core.

Exemplo de intenção de `economy`:
- preferir modelo mais barato/rápido
- usar `contextPolicy=lean`
- permitir escalonamento para modelo melhor somente quando necessário

### Sem modelo local, alternativas viáveis
- roteamento para modelos remotos baratos (mini/flash/haiku-like)
- heurísticas antes de chamar LLM caro (rota, tamanho, regex)
- contexto magro (`lean`)
- guardrail de budget no seu middleware/frontdoor
- caching opportunistic quando provider suportar
- tool-first para consultas determinísticas

## Capability Mapping (degradação graciosa)

Nem todo provider/model suporta as mesmas features (ex.: caching explícito).

Comportamento recomendado:
- Frontdoor pode enviar a intenção (`providerFeatureHints`, `optimizationMode`)
- Gateway/runner aplica o que for suportado
- O que não for suportado é ignorado/ajustado sem quebrar a requisição (quando seguro)
- Auditar/metrificar ajustes quando necessário

## BYOK (`apiKey` / `authProfileId`) por request

Regras práticas:
- permitir apenas por origem trusted e com escopo apropriado (`admin/system`)
- nunca aceitar via canal direto
- nunca logar segredo em claro
- auditar accepted/rejected

## Payloads de exemplo

### 1) Canal direto (sem override sensível)

```json
{
  "sessionKey": "main",
  "message": "Qual o status do meu pedido?",
  "idempotencyKey": "req-plain-1"
}
```

### 2) Trusted frontdoor com filtro de campos

Se `allowedOverrideFields=["model"]` e o frontdoor enviar `systemPrompt`, o gateway pode:
- remover `systemPrompt`
- manter `model`
- seguir com a requisição

### 3) Trusted frontdoor com claims expirados

Resultado esperado:
- `FORBIDDEN`
- mensagem indicando claims expirados

## Checklist de integração (frontdoor)

- [ ] Resolver identidade (telefone/chatId -> principal corporativo)
- [ ] Definir entitlements e roles antes de montar override
- [ ] Gerar `idempotencyKey` por request
- [ ] Incluir `requestSource=trusted_frontdoor_api`
- [ ] Incluir claims com janela de validade (`issuedAt`, `expiresAt`)
- [ ] Enviar somente campos de override necessários (patch parcial)
- [ ] Tratar fallback como comportamento padrão (não repetir defaults no payload)
- [ ] Auditar no seu lado também (requestId/correlationId)

## Estado atual da implementação (backend)

Já implementado:
- `requestContext` opcional em `chat.send`
- `requestSource` por request
- claims sanitizados de trusted frontdoor
- rejeição de claims expirados
- policy baseline de overrides por origem
- métricas/auditoria best-effort de campos rejeitados

Ainda em evolução:
- integração com RBAC/ABAC/entitlements completos (Plan 1)
- validação forte de claims (JWT/HMAC/signature strategy)
- policy fina por tenant para permitir `optimizationMode` em canais diretos

