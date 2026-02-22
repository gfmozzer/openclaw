# Guia Operacional: Pagina `/cron` (Jobs Console)

Este documento explica, de forma pratica, como usar e interpretar a pagina `http://localhost:5173/cron` depois do refactor de cron para orquestracao enterprise.

## 1) O que a pagina representa hoje

A aba `/cron` nao e mais apenas "cron local". Ela virou um **console unico de jobs agendados** para dois modos:

- **Temporal workflow**: orquestracao distribuida (modo enterprise recomendado).
- **Short queue**: execucao por fila/engine local (fallback/compatibilidade).

O texto exibido em **Execution mode** vem de `cron.status.orchestrationMode`.

## 2) Bloco superior: leitura rapida de saude

No primeiro card voce ve:

- **Execution mode**:
  - `Temporal workflow` quando `orchestrationMode` contem `temporal`.
  - `Short queue` em outros modos.
- **Enabled**: se o scheduler esta habilitado/conectado.
- **Jobs**: quantidade total de jobs registrados.
- **Next wake**: proxima execucao prevista (quando aplicavel).

Resumo adicional:

- **Active**: jobs com `enabled = true`.
- **Paused**: jobs com `enabled = false`.
- **Failed**: jobs com ultimo status `error`.
- **Retry candidates**: jobs com erro e ainda habilitados.

## 3) Criacao de job: campo a campo (card "New Job")

### Identificacao

- **Name** (obrigatorio): nome operacional do job.
- **Description** (opcional): contexto para operadores.
- **Agent ID** (opcional): agente alvo. Se vazio, usa default/resolucao do backend.
- **Enabled**: cria ativo (`true`) ou pausado (`false`).

### Agendamento (`Schedule`)

Voce escolhe 1 tipo:

- **Every**
  - `Every` + `Unit` (`minutes|hours|days`).
  - Ex.: `Every=15`, `Unit=minutes` => roda a cada 15 minutos.
- **At**
  - `Run at` (datetime-local).
  - Ex.: execucao unica em data/hora especifica.
- **Cron**
  - `Expression` (obrigatorio), ex.: `0 9 * * 1-5`
  - `Timezone (optional)`, ex.: `America/Sao_Paulo`

### Sessao e disparo

- **Session**
  - `main`: usa sessao principal.
  - `isolated`: cria/usa sessao isolada para execucoes recorrentes.
- **Wake mode**
  - `now`: executa no tick atual.
  - `next-heartbeat`: agenda para o proximo heartbeat.

### Payload (o que o job faz)

- **systemEvent**
  - Campo: `System text` (obrigatorio).
  - Uso: instruir sistema/evento interno.
- **agentTurn**
  - Campo: `Agent message` (obrigatorio).
  - Campo opcional: `Timeout (seconds)`.
  - Uso: pedir uma rodada de resposta do agente.

### Delivery (entrega de resultado)

- **none**: sem entrega externa (interno).
- **webhook**: faz POST para URL (campo `Webhook URL`).
- **announce**: publica resumo em canal/chat.

Regra importante da UI:

- `announce` so e permitido quando:
  - `Session = isolated` **e**
  - `Payload = agentTurn`.
- Se essa combinacao nao existir, a tela normaliza para `none`.

Campos adicionais:

- Em `announce`:
  - `Channel`: canal destino (`last` usa ultimo canal).
  - `To`: alvo (telefone/chat id) opcional.
- Em `webhook`:
  - `Webhook URL`: endpoint de entrega.

## 4) Lista de jobs: como interpretar cada linha

Cada linha mostra:

- Nome + schedule formatado.
- Payload resumido.
- Delivery resumido (`mode` e destino).
- Badges:
  - `Enabled/Disabled`
  - `sessionTarget`
  - `wakeMode`
- Estado lateral:
  - **Status**: `ok`, `error`, `skipped` ou `n/a`.
  - **Next**: proxima execucao relativa.
  - **Last**: ultima execucao relativa.

Acoes por job:

- **Enable/Disable**
- **Run** (disparo forcado imediato via `cron.run`)
- **History** (carrega `cron.runs` para aquele job)
- **Remove** (remove job)

## 5) Historico de execucao (Run history)

Quando voce clica `History`:

- A tela chama `cron.runs` (limite 50) para o `jobId`.
- Mostra:
  - `status`
  - `summary`
  - timestamp
  - `durationMs`
  - erro (se houver)

Se houver `sessionKey`, aparece link **Open run chat** para abrir o chat daquela execucao.

## 6) Como validar se o scheduler esta funcionando (checklist)

1. Em `/cron`, confirme `Execution mode` esperado (`Temporal workflow` no seu alvo enterprise).
2. Crie um job simples:
   - `Every=1 minute`
   - `Payload=agentTurn` com texto curto
   - `Session=isolated`, `Wake mode=now`
3. Confira na lista:
   - `Enabled`
   - `Next` preenchido
4. Clique `Run` e depois `History`.
5. Verifique:
   - entrada nova com `ok` (ou erro explicito)
   - `durationMs`
   - link `Open run chat` quando houver `sessionKey`.

## 7) Erros comuns e leitura rapida

- **`missing authenticated principal for temporal scheduling`**
  - Conexao sem principal enterprise autenticado para operacoes Temporal.
- **`scheduler orchestrator not configured for temporal mode`**
  - Modo Temporal ativo sem orquestrador inicializado.
- **`forbidden` / `scheduler deny action=...`**
  - Bloqueio de politica supervisor/worker (RBAC/ABAC do scheduler).
- **`Cron expression required` / `Invalid interval amount` / `Invalid run time`**
  - Validacao de formulario no cliente.
- **`invalid ... params`**
  - Payload invalido na chamada RPC do metodo cron correspondente.

## 8) Diferenca pratica: Temporal vs Short queue

- **Temporal workflow**
  - Estado e historico distribuidos/orquestrados.
  - Politica de autorizacao por tenant/caller/target.
  - Melhor para swarm multi-container.
- **Short queue**
  - Execucao local/compatibilidade.
  - Menos robusto para distribuicao horizontal.

## 9) Boas praticas operacionais

- Nomeie jobs com padrao: `dominio:acao:periodicidade` (ex.: `sales:daily-summary:09h`).
- Para jobs recorrentes de agente, prefira `session=isolated`.
- Use `announce` apenas quando realmente precisar publicar retorno em canal.
- Para integracoes externas, prefira `webhook` com observabilidade no endpoint receptor.
- Sempre use `History` apos alteracoes de schedule/payload para validar.
