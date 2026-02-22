---
title: "Plan 0: Backend Contract + Security for Provider Credentials and Model Catalog"
status: done
priority: CRITICAL
parallelizable: partial
updated: 2026-02-22
owner: "gateway-backend"
---

# Plan 0: Backend Contract and Security

## Objetivo

Expor contratos RPC para:
- listar providers suportados
- gerenciar credenciais com armazenamento seguro
- validar credenciais (smoke test)
- listar modelos disponiveis por provider para uso no frontend

Sem depender de edicao manual de `config` raw.

## Decisoes aprovadas

### 1. Escopos (least-privilege)

| Metodo | Escopo |
|--------|--------|
| `providers.registry.list` | `READ_SCOPE` |
| `providers.models.list` | `READ_SCOPE` |
| `providers.credentials.list` | `READ_SCOPE` (sem segredo, so metadata) |
| `providers.credentials.upsert` | `ADMIN_SCOPE` |
| `providers.credentials.delete` | `ADMIN_SCOPE` |
| `providers.credentials.test` | `ADMIN_SCOPE` |

### 2. Rate limit

- Reutilizar mecanismo existente de control-plane rate limit (`src/gateway/control-plane-rate-limit.ts`).
- Adicionar `providers.credentials.test` ao conjunto limitado (opcionalmente `upsert/delete` tambem).
- Nao criar limiter custom paralelo.

### 3. Armazenamento de credenciais

- **Fonte canonica para escrita nova:** auth profiles (`upsertAuthProfile`).
- **Compatibilidade de leitura:** manter as duas fontes (auth profiles + `models.providers.*.apiKey`), sem quebrar legado.
- **Nao remover** `apiKey` inline do config nesta fase.

### 4. Payload de `providers.registry.list`

Retorno unificado com source para frontend e debug operacional:

```ts
{
  id: string;              // "openai", "anthropic", etc.
  label: string;           // "OpenAI", "Anthropic", etc.
  sources: ("plugin" | "builtin" | "custom")[];
  hasCredential: boolean;
  credentialType: string;  // "api_key" | "token" | "oauth"
  modelCount: number;
  supportsCredentialTest: boolean;
  supportsLiveModelDiscovery: boolean;
}
```

### 5. Cache de `providers.models.list`

- Cache explicito com TTL de 5 minutos no servico novo.
- Em mutacoes de credencial (`upsert/delete`), invalidar:
  - cache TTL do servico de providers
  - cache de catalogo global (expor reset nao-test-only no model catalog)
- Nao depender de `resetModelCatalogCacheForTest()` em codigo de producao.

### 6. Ordem de implementacao

1. Protocolo/validators + method registration + scopes
2. `providers.registry.list`
3. `providers.credentials.list/upsert/delete`
4. `providers.models.list` (com cache + invalidacao)
5. `providers.credentials.test` (com rate limit)
6. Testes

## Escopo tecnico

1. Novo contrato RPC de providers/credentials
- `providers.registry.list`
- `providers.credentials.list`
- `providers.credentials.upsert`
- `providers.credentials.delete`
- `providers.credentials.test`
- `providers.models.list`

2. Servico backend de providers
- Fonte A: providers plugin (`resolvePluginProviders`).
- Fonte B: built-ins/model catalog (`loadGatewayModelCatalog`).
- Fonte C: providers custom de `models.providers` (apenas metadados, sem segredo).

3. Armazenamento de credenciais
- Persistir em auth profiles (`upsertAuthProfile*`).
- Nunca persistir segredo em texto de resposta.
- Usar redacao de segredo consistente com config redaction.

4. Seguranca e autorizacao
- Escopos conforme tabela acima (least-privilege).
- Auditoria para upsert/delete/test (sem apiKey em log).
- Rate limit via control-plane rate limit existente.

5. Catalogo de modelos por provider
- `providers.models.list` retorna:
  - providerId
  - modelos disponiveis
  - origem (builtin/discovered/custom)
  - status de disponibilidade
- Cache TTL 5 min + invalidacao apos mudar credencial.

## Arquivos alvo

### Novos
- `src/gateway/protocol/schema/providers.ts` — TypeBox schemas
- `src/gateway/server-methods/providers.ts` — handlers RPC

### Modificados
- `src/gateway/protocol/schema.ts` — re-export providers schemas
- `src/gateway/protocol/protocol-schemas.ts` — adicionar ao mapa ProtocolSchemas
- `src/gateway/protocol/index.ts` — compilar validators AJV + re-export
- `src/gateway/server-methods.ts` — importar e registrar providersHandlers
- `src/gateway/method-scopes.ts` — classificar metodos nos escopos corretos
- `src/agents/model-catalog.ts` — expor `resetModelCatalogCache()` (nao-test-only)

### Reuso (sem modificacao esperada)
- `src/agents/auth-profiles.ts` (barrel)
- `src/agents/auth-profiles/store.ts` — leitura/escrita de credenciais
- `src/agents/models-config.providers.ts` — discovery de providers

## Regras de contrato

- Nunca retornar segredo completo; somente:
  - `hasCredential: true|false`
  - `credentialType`
  - `lastUpdatedAt` (quando existir)
- Teste de credencial deve retornar erro normalizado por provider.
- Nao bloquear providers sem endpoint de listagem de modelos: fallback para catalogo built-in.

## Testes

1. Unit
- serializacao/redacao de credenciais
- autorizacao por escopo
- normalizacao de erro de smoke test

2. Gateway
- sucesso/falha de `providers.credentials.upsert`
- `providers.models.list` com e sem credencial
- tentativa sem escopo admin retorna denied

3. Regressao
- `models.list` legado continua funcional
- chat/send e rotacao de auth profile nao quebram

## Criterio de aceite

- Frontend consegue listar providers e status de credencial sem ler raw config.
- Credencial pode ser criada/testada/removida via RPC.
- Catalogo de modelos por provider e acessivel via RPC.
- Logs/audit sem vazamento de segredo.

## Complexidade detalhada

- Dominio tecnico: alta
- Risco de regressao: medio-alto
- Esforco estimado: 4 a 6 dias uteis
