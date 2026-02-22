# Guia Operacional: Pagina `/config`

Este guia descreve como usar a pagina `http://localhost:5173/config`, o que cada area faz e como interpretar os botoes do canto superior direito.

Baseado em codigo:

- UI: `ui/src/ui/views/config.ts`, `ui/src/ui/views/config-form.render.ts`
- Controller UI: `ui/src/ui/controllers/config.ts`
- Backend RPC: `src/gateway/server-methods/config.ts`, `src/gateway/server-methods/update.ts`

## 1) Estrutura geral da pagina

A tela tem 3 blocos principais:

1. **Sidebar esquerda**  
   - Lista de secoes de configuracao (Settings).
   - Campo de busca (`Search settings...`).
   - Botao `All Settings` + secoes individuais.
   - Alternancia de modo no rodape: `Form` / `Raw`.

2. **Area central superior (Action bar)**  
   - Badge de mudancas pendentes.
   - 4 botoes no canto superior direito: `Reload`, `Save`, `Apply`, `Update`.

3. **Area central de conteudo**  
   - Formulario (modo Form) ou editor JSON5 (modo Raw).
   - Subnavegacao interna da secao ativa (abas internas).
   - Painel de diff (quando ha mudancas no modo Form).
   - Painel de erros (`issues`) quando houver validacao/parse invalido.

## 2) Sidebar: itens e finalidade de cada secao

As secoes fixas definidas pela UI sao:

- `Environment` (`env`): variaveis de ambiente do processo gateway.
- `Updates` (`update`): canal/comportamento de atualizacao.
- `Agents` (`agents`): configuracoes de agentes, identidade, modelos.
- `Authentication` (`auth`): perfis/chaves de autenticacao.
- `Channels` (`channels`): canais de mensagem (WhatsApp/Telegram/Discord etc.).
- `Messages` (`messages`): roteamento e comportamento de mensagens.
- `Commands` (`commands`): comandos customizados.
- `Hooks` (`hooks`): hooks/webhooks/eventos.
- `Skills` (`skills`): skills e capacidades.
- `Tools` (`tools`): ferramentas internas/externas.
- `Gateway` (`gateway`): bind, auth e comportamento do servidor gateway.
- `Setup Wizard` (`wizard`): estado do assistente de setup.

Observacao importante:

- Alem dessas secoes fixas, a UI adiciona **secoes extras automaticamente** quando aparecem no `config.schema` e nao existem na lista fixa (ex.: secoes de plugins).

## 3) Abas internas de cada item (subtabs)

Quando voce clica numa secao (ex.: `agents`), a UI tenta criar uma subnavegacao interna com base no schema:

- A subaba `All` (interna) sempre aparece quando a secao tem subsecoes.
- As outras abas internas sao as propriedades de primeiro nivel daquela secao no schema.
  - Exemplo: se `agents` tiver propriedades `list`, `default`, `routing`, essas viram subtabs internas.

Como a subtab funciona:

- Clicar em uma subtab filtra o formulario para aquele bloco especifico.
- Se houver busca ativa (`Search settings...`), o filtro de subtabs e reduzido para exibir apenas campos correspondentes.

Resumo tecnico:

- Sidebar principal = secoes top-level.
- Subtabs internas = propriedades do objeto da secao ativa no `config.schema`.

## 4) Modo `Form` vs `Raw`

### Form

- Renderiza campos tipados pelo schema (`config.schema`).
- Mostra labels/hints de `uiHints`.
- Mantem diff de mudancas.
- Pode exibir alerta:
  - `"Form view can't safely edit some fields. Use Raw to avoid losing config entries."`
  - Isso indica caminhos de schema que o form nao consegue editar com seguranca.

### Raw

- Editor de texto `Raw JSON5`.
- Permite editar o arquivo completo diretamente.
- Recomendado quando:
  - O form nao cobre algum campo.
  - Ha estruturas avancadas/custom de plugin.

## 5) Os 4 botoes no canto superior direito

## `Reload`

O que faz:

- Recarrega snapshot atual da config (`config.get`).
- Nao grava nada.
- Nao reinicia processo.

Quando usar:

- Para descartar visualmente alteracoes locais.
- Para sincronizar apos mudanca feita por outro operador/processo.

## `Save`

O que faz:

- Envia configuracao para `config.set`.
- Escreve arquivo de config no disco.
- **Nao agenda restart** do gateway.

Quando usar:

- Quando voce quer persistir o arquivo sem aplicar/reiniciar imediatamente.

## `Apply`

O que faz:

- Envia configuracao para `config.apply`.
- Escreve config e agenda restart controlado (`SIGUSR1`) no gateway.
- Gera sentinel de restart para auditoria/retorno.

Quando usar:

- Quando precisa aplicar efetivamente a nova configuracao em runtime.

## `Update`

O que faz:

- Executa `update.run`.
- Roda fluxo de update do gateway (com timeout opcional no backend).
- **So agenda restart se update concluir com sucesso**.

Quando usar:

- Para atualizar versao/artefatos do gateway.
- Nao e para aplicar config; e para rotina de update.

## 6) Regras de habilitacao dos botoes

`Save` e `Apply` ficam habilitados somente quando:

- existe conexao (`connected`);
- ha mudancas pendentes;
- nao esta em loading/saving/applying;
- no modo Form, existe schema + form valido para serializacao.

`Update` fica habilitado quando:

- existe conexao;
- nao esta em applying/updating.

## 7) Como interpretar status e mudancas

Elementos da action bar:

- `No changes`: nada pendente.
- `Unsaved changes` (Raw) ou `N unsaved changes` (Form): ainda nao foi salvo/aplicado.
- Em Form, pode abrir o painel `View N pending changes` para ver diff por path.

Validade (`valid/invalid/unknown`) no topo da sidebar:

- Vem do snapshot validado retornado por `config.get`.
- Se `invalid`, o painel de issues exibe detalhes.

## 8) Fluxo recomendado de operacao

1. Abrir `/config`.
2. `Reload` (garantir baseline atual).
3. Editar no modo `Form` ou `Raw`.
4. Conferir badge de mudancas + diff.
5. `Save` para persistir.
6. `Apply` para efetivar com restart controlado.
7. Voltar em `Reload` para confirmar estado final.

## 9) Duplicidade importante: `config.patch` existe no backend

No backend existe `config.patch` com merge patch e restart, mas a UI desta pagina usa principalmente:

- `config.get`
- `config.schema`
- `config.set`
- `config.apply`
- `update.run`

Ou seja: o fluxo visual padrao da pagina nao expoe um botao dedicado de patch.

## 10) Observacoes para investigar posteriormente

Itens abaixo dependem de ambiente/plugins/runtime e **nao foram validados aqui em execucao manual ponta a ponta**:

1. **Se todas as secoes extras dinamicas (fora lista fixa) estao completas no Form** em todos os plugins instalados.  
2. **Se todos os campos de cada subtab interna possuem `uiHints` corretos** (label/help/order) para operacao sem ambiguidade.  
3. **Se `Save` sem `Apply` atende seu fluxo em producao** (como nao reinicia, parte das mudancas pode nao refletir de imediato em componentes ja inicializados).  
4. **Se `Apply` + restart sentinel esta chegando no canal/contexto esperado** no seu ambiente (deliveryContext/threadId).  
5. **Se `Update` esta permitido para todos os perfis de operador** no seu deployment (RBAC/token scopes + politica interna).  
6. **Se os warnings de `formUnsafe` cobrem 100% dos casos de perda de campos** para schemas avancados de plugin.  
7. **Comportamento de validacao em JSON5 complexo no modo Raw** (principalmente objetos grandes com redactions e restore de segredos).  

## 11) Provider/Model: fluxo recomendado (apos Plan 2)

Para evitar editar JSON manual:

1. Use a aba `Providers` (`/providers`) para cadastrar e testar credenciais.
2. Em `Agents > Overview`, selecione o modelo em campo pesquisavel (`provider/model`).
3. Use `/config` apenas para ajustes avancados/legado.

Feature flags de rollout:

- Backend RPC: `OPENCLAW_PROVIDERS_RPC_ENABLED` (default `1`)
- Frontend aba Providers: `VITE_OPENCLAW_PROVIDERS_UI_ENABLED` (default `1`)
