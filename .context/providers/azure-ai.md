# Azure AI / Azure OpenAI - Nota de Integracao (Driver/Provider)

## Status no projeto (hoje)

Azure hoje entra no projeto principalmente por dois caminhos:

1. **Custom provider OpenAI-compatible** (ja suportado)
   - via onboarding/config de `baseUrl` + `model/deployment`
   - com tratamento especial para endpoints Azure (`*.services.ai.azure.com`, `*.openai.azure.com`)
2. **Nao existe ainda** um driver dedicado `azure` no runtime pluggable (`driver/provider`) do plano novo

Ou seja:
- voce **ja consegue** usar Azure via compatibilidade OpenAI/custom provider em varios cenarios
- mas o modelo enterprise novo (`driverId` explicito + `drivers.*`) ainda depende do **Plan 2**

## Evidencia no codigo (confirmado)

- `src/commands/onboard-custom.ts`
  - detecta hosts Azure:
    - `*.services.ai.azure.com`
    - `*.openai.azure.com`
  - transforma URL para incluir `/openai/deployments/<model>`
  - injeta `api-version` em verificacao (`2024-10-21`)

Isso e importante porque Azure usa **deployment name** no lugar de `model` literal em varios fluxos.

## Classificacao na arquitetura alvo

Opcoes validas (depende da estrategia):

### Opcao A - Mais simples / compativel

- **Driver:** `native` ou `litellm` (dependendo do adapter usado)
- **Provider:** `azure-openai` (custom provider ID)

### Opcao B - Mais explicita (futuro)

- **Driver:** `azure` (adapter dedicado)
- **Provider:** `azure-openai` ou `azure-ai-foundry`

Recomendacao inicial:
- Comecar pela **Opcao A** (custom provider + compat OpenAI), porque reutiliza o que o core ja sabe fazer.

## Credenciais (estado atual)

### Estado atual (core)

- `resolveEnvApiKey(...)` **nao tem mapeamento especifico** para `azure-openai` no resolver generico.
- O fluxo funcional hoje tende a ser:
  - credencial em `auth profiles` (Providers UI) para provider custom
  - ou `models.providers.<provider>.apiKey` (legado/config)

### Variaveis comuns de Azure (referencia operacional)

Estas variaveis sao uteis para padronizar ops, mas ainda precisam de mapeamento explicito no adapter/driver ou no fluxo de custom provider:

- `AZURE_OPENAI_API_KEY`
- `AZURE_AI_PROJECT_ENDPOINT` (Foundry)
- `AZURE_OPENAI_ENDPOINT` (classic Azure OpenAI)
- `AZURE_OPENAI_DEPLOYMENT` (se quisermos padronizar por ENV)

## Como usar Azure hoje (sem driver dedicado)

### Caminho recomendado agora

1. Criar provider custom (OpenAI-compatible) no config/onboarding
2. Informar `baseUrl` Azure
3. Informar `modelId` = **nome do deployment**
4. Armazenar credencial por provider custom (Providers UI / auth profile)

Exemplo conceitual:

- `providerId`: `azure-openai-finance`
- `baseUrl`: `https://my-resource.openai.azure.com`
- `model/deployment`: `gpt-4o-prod`

Observacao:
- Em Azure, o "modelo" que o operador escolhe muitas vezes e o **deployment name**. Isso deve ficar claro na UI.

## Discovery de modelos (Azure)

### O que e viavel

- Em Azure AI Foundry (`@azure/ai-projects`), listar deployments do projeto.
- Em Azure OpenAI classico, o discovery pode ser diferente/limitado dependendo do endpoint e permissoes.

### Implicacao para nosso plano

No `Plan 2`, `drivers.models.list` para Azure deve:
- diferenciar `modelName` (modelo base) vs `deploymentName` (rota executavel)
- retornar rota tecnica clara:
  - `driverId`
  - `providerId`
  - `modelId` (idealmente deployment)
  - metadata opcional com `baseModel`

## Smoke tests recomendados (quando entrar no modelo drivers.*)

### Nivel 1 - Driver

- Load do adapter Azure (ou caminho compativel OpenAI)
- Validacao de endpoint base

### Nivel 2 - Credential

- Chamada minima ao endpoint Azure com timeout curto
- Tratar explicitamente:
  - `401/403` (credencial/permissao)
  - deployment inexistente
  - content filter / policy

### Nivel 3 - Route

- Inferencia curta no deployment especifico
- Logar separadamente:
  - `provider=azure-openai`
  - `driver=native|litellm|azure`
  - `modelRoute`

## Tool Mode (relacao com Azure)

Azure tambem pode ser usado para modelos nao conversacionais no futuro (embeddings, multimodal, etc.), mas:

- `Tool Mode` continua sendo metadata de **rota de modelo**
- nao vira papel de agente
- nao substitui container de worker/supervisor/manager

## Checklist de onboarding futuro (Azure)

1. Decidir estrategia inicial:
   - custom provider OpenAI-compatible (recomendado para arrancar)
   - ou driver `azure` dedicado
2. Padronizar `providerId` (ex.: `azure-openai`)
3. Implementar/confirmar credencial canônica em `auth profiles`
4. Implementar `drivers.models.list` com foco em **deployments**
5. Implementar `drivers.smoke.test` com erros Azure bem classificados
6. Ajustar UI para rotular campo como `Deployment` quando provider for Azure

## Exemplo de ENV (futuro/ops)

```env
# Driver runtime gating (se houver driver dedicado Azure)
OPENCLAW_DRIVERS_ENABLED=native,azure
OPENCLAW_DRIVER_DEFAULT=native
OPENCLAW_DRIVER_AZURE_ENABLED=1
OPENCLAW_DRIVER_AZURE_PACKAGE=@acme/openclaw-driver-azure

# Credenciais/endpoint (convencao operacional; precisa ser consumida pelo adapter)
AZURE_OPENAI_API_KEY=xxx
AZURE_OPENAI_ENDPOINT=https://my-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=gpt-4o-prod
```

## Plano de implementacao (referencia)

- `driver-provider-plan-2-credentials-discovery-and-smoke.md`
- `driver-provider-plan-3-ui-swarm-ops-and-rollout.md`

## Riscos e pontos de atencao

- Confusao entre `model` e `deployment` na UX.
- Diferencas entre Azure Foundry e Azure OpenAI classico.
- Policy/content filtering precisa aparecer como erro explicito, nao "erro generico".
