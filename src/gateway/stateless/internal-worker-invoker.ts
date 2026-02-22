/**
 * InternalWorkerInvoker - Implementação do contrato de invocação interna de workers
 *
 * Integra com:
 * - BullMQ (Redis) para ephemeral_async
 * - Temporal (SchedulerOrchestrator) para durable_async/scheduled
 * - Invocação direta (sync) para inline_sync
 *
 * @see InternalWorkerInvoker em contracts/internal-worker-invocation.ts
 */

import { Queue } from "bullmq";
import type {
  AsyncEnqueueRequest,
  AsyncEnqueueResult,
  CallbackRequest,
  CallbackResult,
  InternalWorkerConfig,
  InternalWorkerErrorCode,
  InternalWorkerInvoker,
  ScheduleRequest,
  ScheduleResult,
  SyncInvokeRequest,
  SyncInvokeResult,
} from "./contracts/internal-worker-invocation.js";
import type { SchedulerOrchestrator } from "./contracts/scheduler-orchestrator.js";
import { createQueue, isRedisAvailable, type QueueName } from "./adapters/redis/bullmq-queue-factory.js";

export type InternalWorkerInvokerDependencies = {
  /** SchedulerOrchestrator para workflows duráveis */
  schedulerOrchestrator?: SchedulerOrchestrator;
  /** Lookup de configuração de worker */
  getWorkerConfig: (agentId: string, tenantId: string) => InternalWorkerConfig | undefined;
  /** Handler de execução síncrona (implementação específica) */
  syncExecutor: (params: {
    agentId: string;
    tenantId: string;
    payload: Record<string, unknown>;
    timeoutMs: number;
  }) => Promise<{
    success: boolean;
    output?: Record<string, unknown>;
    error?: { code: string; message: string };
  }>;
};

export class DefaultInternalWorkerInvoker implements InternalWorkerInvoker {
  private readonly ephemeralQueues = new Map<string, Queue>();

  constructor(private readonly deps: InternalWorkerInvokerDependencies) {}

  /**
   * Invoca uma tarefa síncrona (inline)
   */
  async invokeSync(request: SyncInvokeRequest): Promise<SyncInvokeResult> {
    const startTime = Date.now();
    const workerConfig = this.deps.getWorkerConfig(
      request.targetWorkerAgentId,
      request.tenantId,
    );

    if (!workerConfig) {
      return {
        success: false,
        taskId: request.taskId,
        error: {
          code: "WORKER_NOT_FOUND",
          message: `Worker config not found: ${request.targetWorkerAgentId}`,
          retryable: false,
        },
        executionTimeMs: Date.now() - startTime,
      };
    }

    // Verifica se worker permite execução inline
    const allowedModes = workerConfig.executionConstraints?.allowedExecutionModes;
    if (allowedModes && !allowedModes.includes("inline")) {
      return {
        success: false,
        taskId: request.taskId,
        error: {
          code: "EXECUTION_MODE_UNAVAILABLE",
          message: "Worker does not allow inline execution",
          retryable: false,
        },
        executionTimeMs: Date.now() - startTime,
      };
    }

    try {
      const result = await this.deps.syncExecutor({
        agentId: request.targetWorkerAgentId,
        tenantId: request.tenantId,
        payload: request.payload,
        timeoutMs: request.timeoutMs,
      });

      if (result.success) {
        return {
          success: true,
          taskId: request.taskId,
          output: result.output ?? {},
          executionTimeMs: Date.now() - startTime,
        };
      } else {
        return {
          success: false,
          taskId: request.taskId,
          error: {
            code: (result.error?.code as InternalWorkerErrorCode) ?? "INTERNAL_ERROR",
            message: result.error?.message ?? "Unknown error",
            retryable: false,
          },
          executionTimeMs: Date.now() - startTime,
        };
      }
    } catch (error) {
      return {
        success: false,
        taskId: request.taskId,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
        },
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Enfileira uma tarefa assíncrona (BullMQ)
   */
  async enqueue(request: AsyncEnqueueRequest): Promise<AsyncEnqueueResult> {
    if (!isRedisAvailable()) {
      return {
        success: false,
        taskId: request.taskId,
        error: {
          code: "EXECUTION_MODE_UNAVAILABLE",
          message: "Redis not available for ephemeral queue",
        },
      };
    }

    const workerConfig = this.deps.getWorkerConfig(
      request.targetWorkerAgentId,
      request.tenantId,
    );

    if (!workerConfig) {
      return {
        success: false,
        taskId: request.taskId,
        error: {
          code: "WORKER_NOT_FOUND",
          message: `Worker config not found: ${request.targetWorkerAgentId}`,
        },
      };
    }

    // Verifica se worker permite execução redis_ephemeral
    const allowedModes = workerConfig.executionConstraints?.allowedExecutionModes;
    if (allowedModes && !allowedModes.includes("redis_ephemeral")) {
      return {
        success: false,
        taskId: request.taskId,
        error: {
          code: "EXECUTION_MODE_UNAVAILABLE",
          message: "Worker does not allow redis_ephemeral execution",
        },
      };
    }

    try {
      const queue = this.getOrCreateEphemeralQueue(request.queueConfig.queueName);
      const job = await queue.add(
        request.taskId,
        {
          taskId: request.taskId,
          targetWorkerAgentId: request.targetWorkerAgentId,
          tenantId: request.tenantId,
          payload: request.payload,
          delegationContext: request.delegationContext,
          trace: request.trace,
        },
        {
          priority: request.queueConfig.priority,
          delay: request.queueConfig.delayMs,
          attempts: request.queueConfig.attempts ?? 3,
          backoff: request.queueConfig.backoff ?? {
            type: "exponential",
            delay: 1000,
          },
        },
      );

      return {
        success: true,
        taskId: request.taskId,
        jobId: job.id ?? request.taskId,
        queuedAt: Date.now(),
        estimatedExecutionAt: request.queueConfig.delayMs
          ? Date.now() + request.queueConfig.delayMs
          : undefined,
      };
    } catch (error) {
      return {
        success: false,
        taskId: request.taskId,
        error: {
          code: "QUEUE_FULL",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Agenda uma tarefa (Temporal)
   */
  async schedule(request: ScheduleRequest): Promise<ScheduleResult> {
    if (!this.deps.schedulerOrchestrator) {
      return {
        success: false,
        taskId: request.taskId,
        error: {
          code: "EXECUTION_MODE_UNAVAILABLE",
          message: "Scheduler orchestrator not available",
        },
      };
    }

    const workerConfig = this.deps.getWorkerConfig(
      request.targetWorkerAgentId,
      request.tenantId,
    );

    if (!workerConfig) {
      return {
        success: false,
        taskId: request.taskId,
        error: {
          code: "WORKER_NOT_FOUND",
          message: `Worker config not found: ${request.targetWorkerAgentId}`,
        },
      };
    }

    // Verifica se worker permite execução temporal_workflow
    const allowedModes = workerConfig.executionConstraints?.allowedExecutionModes;
    if (allowedModes && !allowedModes.includes("temporal_workflow")) {
      return {
        success: false,
        taskId: request.taskId,
        error: {
          code: "EXECUTION_MODE_UNAVAILABLE",
          message: "Worker does not allow temporal_workflow execution",
        },
      };
    }

    try {
      const scope = {
        tenantId: request.tenantId,
        agentId: request.targetWorkerAgentId,
        jobId: request.taskId,
      };

      // Mapeia schedule para SchedulerSchedule
      const schedule =
        request.schedule.kind === "immediate"
          ? { kind: "at" as const, at: new Date().toISOString() }
          : request.schedule.kind === "at"
            ? { kind: "at" as const, at: new Date(request.schedule.atEpochMs).toISOString() }
            : {
                kind: "cron" as const,
                expr: request.schedule.expr,
                tz: request.schedule.tz,
              };

      const result = await this.deps.schedulerOrchestrator.registerWorkflow({
        scope,
        workflowKind: "passive_trigger",
        schedule,
        payload: {
          taskId: request.taskId,
          payload: request.payload,
          delegationContext: request.delegationContext,
          trace: request.trace,
          workerConfig: {
            provider: workerConfig.providerConfig.provider,
            model: workerConfig.providerConfig.model,
          },
        },
        queue: request.workflowConfig?.taskQueue,
      });

      return {
        success: true,
        taskId: request.taskId,
        workflowId: result.workflowId,
        runId: result.runId,
        scheduledAt: result.registeredAt,
      };
    } catch (error) {
      return {
        success: false,
        taskId: request.taskId,
        error: {
          code: "WORKFLOW_NOT_FOUND",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Envia callback/resume para um workflow
   */
  async sendCallback(request: CallbackRequest): Promise<CallbackResult> {
    if (!this.deps.schedulerOrchestrator) {
      return {
        success: false,
        taskId: request.taskId,
        error: {
          code: "EXECUTION_MODE_UNAVAILABLE",
          message: "Scheduler orchestrator not available",
        },
      };
    }

    try {
      const accepted = await this.deps.schedulerOrchestrator.recordWorkflowCallback({
        correlationId: request.trace.correlationId,
        scope: {
          tenantId: request.tenantId,
          agentId: request.targetWorkerAgentId,
          jobId: request.taskId,
        },
        workflowId: request.workflowRef.workflowId,
        runId: request.workflowRef.runId,
        status: request.status,
        output: request.output,
        error: request.error,
        completedAt: Date.now(),
      });

      return accepted
        ? {
            success: true as const,
            taskId: request.taskId,
            workflowId: request.workflowRef.workflowId,
            resumed: true,
          }
        : {
            success: false as const,
            taskId: request.taskId,
            error: {
              code: "WORKFLOW_NOT_FOUND" as const,
              message: "Workflow callback was not accepted",
            },
          };
    } catch (error) {
      return {
        success: false,
        taskId: request.taskId,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Obtém ou cria uma fila BullMQ para tarefas ephemeral
   */
  private getOrCreateEphemeralQueue(queueName: string): Queue {
    const existing = this.ephemeralQueues.get(queueName);
    if (existing) {
      return existing;
    }

    // Usa um nome válido de QueueName ou cria um genérico
    const validQueueName = this.isValidQueueName(queueName) ? queueName : "command-lane";
    const queue = createQueue(validQueueName as QueueName);
    this.ephemeralQueues.set(queueName, queue);
    return queue;
  }

  private isValidQueueName(name: string): name is QueueName {
    const validNames: QueueName[] = [
      "followup-drain",
      "inbound-debounce",
      "command-lane",
      "heartbeat-wake",
      "qmd-update",
      "memory-sync",
      "tts-cleanup",
    ];
    return validNames.includes(name as QueueName);
  }

  /**
   * Fecha todas as conexões de fila
   */
  async close(): Promise<void> {
    for (const queue of this.ephemeralQueues.values()) {
      await queue.close();
    }
    this.ephemeralQueues.clear();
  }
}

/**
 * Factory para criar o invoker padrão
 */
export function createInternalWorkerInvoker(
  deps: InternalWorkerInvokerDependencies,
): DefaultInternalWorkerInvoker {
  return new DefaultInternalWorkerInvoker(deps);
}
