# Driver de Integração: Temporal.io

Diferente de provedores clássicos de LLM como OpenAI ou Fal.ai, o [Temporal.io](https://temporal.io) é uma plataforma de "execução durável" (Durable Execution). Ele permite orquestrar sistemas distribuídos onde as tarefas (Workflows) podem rodar por dias, meses ou anos sem perder estado se um servidor reiniciar.

Para o OpenClaw, o Temporal é excelente para **Agentes Autônomos** (para rodar fluxos de longa duração) e **Agendamentos Recorrentes (Schedules / Crons)** seguros e escaláveis.

## 1. Pacotes Oficiais (NPM - TypeScript SDK)

O SDK do Temporal para TypeScript/Node.js é dividido em subpacotes lógicos. Para a aplicação que apenas "inicia" ou "agenda" fluxos (cliente), você precisa principalmente do `@temporalio/client`. Para definir os fluxos na nossa base de código, você usará os outros.

**Instalação geral:**

```bash
pnpm add @temporalio/client @temporalio/worker @temporalio/workflow @temporalio/activity
```

## 2. Conceitos Básicos do Temporal

- **Workflow:** A lógica orquestradora (deve ser determinística, sem acesso a APIs externas ou banco de dados diretamente).
- **Activity:** As tarefas reais (chamadas de API, banco de dados, IO) que o Workflow coordena.
- **Worker:** O processo que escuta filas do Temporal Server e executa as Activities e Workflows.
- **Client (Starter):** A aplicação (ex: OpenClaw CLI ou Gateway) que pede ao Temporal Server para iniciar um Workflow.

## 3. Criando a "Skill" para o Agente Usar

Para que um Agente no OpenClaw possa acionar fluxos de longa duração ou agendar crons, expomos capacidades através do `Client` do Temporal em um formato de Tool/Skill padrão.

### A) Configurando o Cliente no OpenClaw

Primeiro, configuramos a conexão com o Cluster do Temporal (seja local ou Temporal Cloud).

```typescript
import { Connection, Client } from "@temporalio/client";

async function getTemporalClient() {
  // Conecta ao servidor Temporal (por padrão localhost:7233)
  const connection = await Connection.connect({
    host: process.env.TEMPORAL_HOST || "localhost:7233",
  });

  return new Client({
    connection,
    // namespace: 'default', // Para Temporal Cloud, usar o namespace específico + credenciais mTLS
  });
}
```

### B) Criando e Iniciando um Workflow (Execução Assíncrona via Agente)

Se o agente decidir disparar um relatório longo, a Skill invoca o client chamando `start`.

```typescript
// Exemplo de como a Skill do Agente aciona o Workflow
import { getTemporalClient } from "./temporal-config";
// Tipagem importada do nosso pacote de workflows do worker
import type { generateReportWorkflow } from "../workflows/report-workflow";

export async function executeReportSkill(params: {
  userId: string;
  reportType: string;
}) {
  const client = await getTemporalClient();

  // Inicia o workflow e retorna o ID (sem bloquear a resposta do Agente)
  const handle = await client.workflow.start(generateReportWorkflow, {
    taskQueue: "openclaw-queue", // A fila que o Worker está escutando
    workflowId: `report-${params.userId}-${Date.now()}`, // ID único p/ evitar duplicação (Idempotência)
    args: [params], // Argumentos tipados para a função `generateReportWorkflow`
  });

  return {
    success: true,
    workflowId: handle.workflowId,
    message: "O relatório foi enfileirado e será gerado em background.",
  };
}
```

## 4. Agendamentos Recorrentes (Schedules / Cron)

O Temporal SDK moderno utiliza a API de **Schedules** (recomendada no lugar das velhas expressões Cron) para criar tarefas recorrentes (ex: "rodar crawler toda sexta-feira", "verificar API a cada 10 segundos").

O Agente também pode interagir com isso criando, pausando ou deletando agendamentos.

### A) Criando um Schedule via TypeScript

```typescript
import { getTemporalClient } from "./temporal-config";

export async function createRecurringScheduleSkill(params: {
  scheduleId: string;
  intervalMinutes: number;
  payload: any;
}) {
  const client = await getTemporalClient();

  const schedule = await client.schedule.create({
    scheduleId: params.scheduleId,
    // Define a regra de repetição (ex: a cada X minutos)
    spec: {
      intervals: [{ every: `${params.intervalMinutes} minutes` }],
      // Para crons clássicos use: cronExpressions: ['0 12 * * FRI']
    },
    // Qual workflow executar quando o agendamento disparar
    action: {
      type: "startWorkflow",
      workflowType: "checkApiUpdates", // Nome do workflow registrado no Worker
      args: [params.payload],
      taskQueue: "openclaw-queue",
    },
    // Politicas adicionais úteis
    policies: {
      catchupWindow: "1 day", // Se o server cair, ele pega o atraso em até 1 dia
      overlap: "Skip", // Se o anterior não terminou, pula essa execução
    },
  });

  return {
    success: true,
    message: `Tarefa recorrente criada. ID: ${schedule.scheduleId}`,
  };
}
```

### B) Gerenciando Schedules

Você pode prover ferramentas ao Agente permitindo listar, atualizar ou deletar agendamentos:

```typescript
const client = await getTemporalClient();

// Listar agendamentos ativos
const lists = await client.schedule.list();

// Deletar um agendamento específico
const handle = client.schedule.getHandle("meu-id-de-schedule");
await handle.delete();

// Pausar um agendamento temporariamente
await handle.pause("Pausado pelo usuário via dashboard");
```

## 5. Resumo da Integração no Módulo `plugins` / `skills`

Na arquitetura do OpenClaw, a integração do Temporal ficaria estruturada assim:

1. **`temporal.driver.ts`**: Mantém a conexão isolada (`Connection.connect`) e gerencia a criação Singleton do `Client`.
2. **`skills/temporal/start-workflow.ts`**: Ferramenta exposta aos LLMs para iniciar processos pontuais demorados (`client.workflow.start`).
3. **`skills/temporal/create-schedule.ts`**: Ferramenta exposta aos LLMs para que agentes possam agendar tarefas de auto-manutenção (`client.schedule.create`).
4. **Workers**: Precisaremos de um servidor em background (pode ser o próprio Gateway via uma trait paralela) chamando `Worker.create(...)` escutando a `taskQueue` e contendo as funções reais dos Workflows e implementações das Activities (que acessam o DB e a Internet de fato).
