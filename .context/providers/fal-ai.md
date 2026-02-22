# Fal.ai - Nota de Integracao (Driver/Provider)

## Status no projeto (hoje)

- `fal` **nao existe ainda** como driver oficial carregavel no runtime atual.
- O alicerce de `driver runtime` por ENV ja existe (`OPENCLAW_DRIVERS_ENABLED`, `OPENCLAW_DRIVER_<ID>_*`).
- Para Fal.ai funcionar como rota de modelo/tool mode enterprise, ainda falta a implementacao do **Driver/Provider Plan 2** (`drivers.*`, credenciais por driver/provider, smoke por rota).

## Classificacao na arquitetura alvo

- **Driver (SDK/adaptador):** `fal`
- **Provider (billing/auth):** `fal` (caso especial; driver e provider podem coincidir)
- **Tipo de capacidade principal:** imagem, video, audio (nao apenas chat)

Observacao importante:
- Fal.ai e um bom exemplo de por que `driver` e `provider` precisam ser entidades separadas.
- Mesmo quando o id for igual (`fal`/`fal`), o papel arquitetural continua diferente:
  - driver = SDK/execucao
  - provider = credencial/cobranca

## SDK recomendado

- Pacote: `@fal-ai/client`
- Padrao moderno de uso: `fal.run(...)` e `fal.subscribe(...)`

Instalacao (quando formos implementar o driver):

```bash
pnpm add @fal-ai/client
```

## Credenciais (estado atual vs alvo)

### Estado atual (core OpenClaw hoje)

- O resolver generico de env (`resolveEnvApiKey`) **nao mapeia** `fal` hoje.
- Portanto, `FAL_KEY` **nao e consumido automaticamente** pelo runtime atual de modelos.
- Se tentar usar `provider="fal"` hoje sem adapter dedicado, nao vai fechar o ciclo end-to-end.

### Estado alvo (apos Plan 2 / driver Fal)

Suportar credencial em dois caminhos:

1. **Providers UI / Auth Profiles (canônico)**
   - `providerId = "fal"`
   - `credentialType = "api_key"`

2. **ENV por container (fallback/ops)**
   - `FAL_KEY`
   - ou alias interno mapeado pelo adapter (`OPENCLAW_DRIVER_FAL_API_KEY`, se decidirmos padronizar)

## Contrato de modelos Fal (como tratar)

Os modelos Fal nao seguem o contrato unico de `/chat/completions`.

Precisamos representar por rota:

- `driverId = "fal"`
- `providerId = "fal"`
- `modelId = "fal-ai/flux/schnell"` (ou outro endpoint)
- `capability`: `image` | `video` | `audio`
- `toolMode`: normalmente `true` para exposicao como ferramenta reutilizavel

### Implicacao pratica

- Um modelo Fal tende a ser melhor modelado como **Tool Mode** (modelo como API/ferramenta) do que como modelo principal de conversa.
- Isso casa com sua regra:
  - `tool mode` = contrato de API reutilizavel
  - nao e agente/container/papel de swarm

## Smoke tests recomendados (quando o driver existir)

### Nivel 1 - Driver

- Verificar import do `@fal-ai/client`
- Verificar inicializacao do adapter `FalDriver`

### Nivel 2 - Credential

- Validar chave Fal com chamada minima (sem custo alto)
- Erro deve distinguir:
  - credencial invalida
  - quota/conta
  - endpoint/model indisponivel

### Nivel 3 - Route

- Executar job curto em modelo barato/rapido (ex.: imagem simples)
- Retornar latencia, status e shape de output (sem persistir segredo)

## Plano de implementacao (referencia)

- `driver-provider-plan-2-credentials-discovery-and-smoke.md`
- `driver-provider-plan-3-ui-swarm-ops-and-rollout.md`

## Checklist de onboarding futuro (Fal)

1. Instalar `@fal-ai/client` no container que vai usar Fal.
2. Criar driver externo `fal` (entry/package) e habilitar no `.env`.
3. Implementar `drivers.credentials.*` para `providerId=fal`.
4. Implementar `drivers.models.list` para catalogo Fal (estatico + discovery quando viavel).
5. Implementar `drivers.smoke.test` para `driver`, `credential` e `route`.
6. Expor modelos Fal como `toolMode` por default na UI (quando aplicavel).

## Exemplo de ENV (futuro - por container)

```env
# Driver runtime gating
OPENCLAW_DRIVERS_ENABLED=native,fal
OPENCLAW_DRIVER_DEFAULT=native
OPENCLAW_DRIVER_FAL_ENABLED=1
OPENCLAW_DRIVER_FAL_PACKAGE=@acme/openclaw-driver-fal

# Credencial do provider Fal (fallback operacional; canônico será auth profile/UI)
FAL_KEY=fal_xxx
```

## Riscos e pontos de atencao

- Fal tem contratos de input/output heterogeneos por modelo.
- Nem todo modelo Fal deve aparecer no picker de "modelo principal do agente".
- Precisamos separar claramente:
  - modelos de conversa
  - modelos de media/tool-only
