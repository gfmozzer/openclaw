#!/usr/bin/env tsx
/**
 * Migration script: jobs.json → Temporal SchedulerOrchestrator
 *
 * Reads existing cron jobs from the local store (~/.openclaw/cron/jobs.json)
 * and registers them as Temporal workflows via the SchedulerOrchestrator contract.
 *
 * Usage:
 *   OPENCLAW_TEMPORAL_ORCHESTRATOR_ENDPOINT=http://... \
 *   OPENCLAW_TEMPORAL_ORCHESTRATOR_AUTH_TOKEN=... \
 *   OPENCLAW_TENANT_ID=my-tenant \
 *   tsx scripts/migrate-cron-to-temporal.ts [--dry-run] [--store-path /path/to/jobs.json]
 *
 * Options:
 *   --dry-run        Print what would be migrated without making changes
 *   --store-path     Custom path to jobs.json (default: ~/.openclaw/cron/jobs.json)
 */

import fs from "node:fs";
import path from "node:path";
import { loadCronStore, resolveCronStorePath } from "../src/cron/store.js";
import type { CronJob, CronSchedule } from "../src/cron/types.js";
import type {
  RegisterSchedulerWorkflowRequest,
  SchedulerSchedule,
} from "../src/gateway/stateless/contracts/scheduler-orchestrator.js";
import {
  resolveTemporalOrchestratorConfig,
  TemporalSchedulerOrchestrator,
} from "../src/gateway/stateless/adapters/node/temporal-scheduler-orchestrator.js";

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  let dryRun = false;
  let storePath: string | undefined;
  let tenantId: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--store-path" && args[i + 1]) {
      storePath = args[++i];
    } else if (args[i] === "--tenant-id" && args[i + 1]) {
      tenantId = args[++i];
    }
  }

  return { dryRun, storePath, tenantId };
}

function toTemporalSchedule(schedule: CronSchedule): SchedulerSchedule {
  if (schedule.kind === "at") {
    return { kind: "at", at: schedule.at };
  }
  if (schedule.kind === "every") {
    return {
      kind: "every",
      everyMs: schedule.everyMs,
      anchorMs: schedule.anchorMs,
    };
  }
  return {
    kind: "cron",
    expr: schedule.expr,
    tz: schedule.tz,
    staggerMs: schedule.staggerMs,
  };
}

function workflowKindFromPayload(
  payload: CronJob["payload"],
): RegisterSchedulerWorkflowRequest["workflowKind"] {
  if (payload.kind === "systemEvent") {
    return "proactive_followup";
  }
  return payload.deliver ? "report_dispatch" : "passive_trigger";
}

async function main() {
  const { dryRun, storePath: customStorePath, tenantId: argTenantId } = parseArgs(process.argv);
  const tenantId = argTenantId ?? process.env.OPENCLAW_TENANT_ID;

  if (!tenantId) {
    console.error("ERROR: OPENCLAW_TENANT_ID env var or --tenant-id flag is required");
    process.exit(1);
  }

  const config = resolveTemporalOrchestratorConfig();
  if (!config && !dryRun) {
    console.error(
      "ERROR: OPENCLAW_TEMPORAL_ORCHESTRATOR_ENDPOINT is required (or use --dry-run)",
    );
    process.exit(1);
  }

  const storePath = customStorePath ?? resolveCronStorePath();
  console.log(`Reading cron store from: ${storePath}`);

  const store = await loadCronStore(storePath);
  const jobs = store.jobs;

  if (jobs.length === 0) {
    console.log("No jobs found in store. Nothing to migrate.");
    return;
  }

  console.log(`Found ${jobs.length} job(s) to migrate.`);
  if (dryRun) {
    console.log("[DRY RUN] No changes will be made.\n");
  }

  const orchestrator = config ? new TemporalSchedulerOrchestrator(config) : null;
  const results: { jobId: string; name: string; status: "ok" | "skipped" | "error"; reason?: string }[] = [];

  for (const job of jobs) {
    const label = `[${job.id}] "${job.name}"`;

    if (!job.enabled) {
      console.log(`  SKIP ${label} — disabled`);
      results.push({ jobId: job.id, name: job.name, status: "skipped", reason: "disabled" });
      continue;
    }

    const agentId = job.agentId ?? "default";
    const scope = { tenantId, agentId, jobId: job.id };
    const request: RegisterSchedulerWorkflowRequest = {
      scope,
      workflowKind: workflowKindFromPayload(job.payload),
      schedule: toTemporalSchedule(job.schedule),
      payload: {
        scheduler: {
          policyVersion: "v1",
          tenantId,
          targetTenantId: tenantId,
          callerAgentId: agentId,
          callerRole: "supervisor",
          targetAgentId: agentId,
          migratedAt: Date.now(),
          migratedFrom: "jobs.json",
        },
        cronJob: job,
      },
      dedupeKey: `migrate:${tenantId}:${agentId}:${job.id}`,
    };

    if (dryRun) {
      console.log(`  WOULD REGISTER ${label}`);
      console.log(`    scope: ${JSON.stringify(scope)}`);
      console.log(`    schedule: ${JSON.stringify(request.schedule)}`);
      console.log(`    workflowKind: ${request.workflowKind}`);
      results.push({ jobId: job.id, name: job.name, status: "ok" });
      continue;
    }

    try {
      const result = await orchestrator!.registerWorkflow(request);
      console.log(`  OK ${label} → workflowId=${result.workflowId}`);
      results.push({ jobId: job.id, name: job.name, status: "ok" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ERROR ${label} — ${msg}`);
      results.push({ jobId: job.id, name: job.name, status: "error", reason: msg });
    }
  }

  // Summary
  const ok = results.filter((r) => r.status === "ok").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;

  console.log(`\nMigration summary: ${ok} OK, ${skipped} skipped, ${errors} errors`);

  if (errors > 0) {
    console.error("Some jobs failed to migrate. Review errors above.");
    process.exit(1);
  }

  // Rename original file as backup
  if (!dryRun && ok > 0) {
    const backupPath = `${storePath}.pre-temporal.bak`;
    try {
      await fs.promises.copyFile(storePath, backupPath);
      console.log(`Backup saved: ${backupPath}`);
    } catch (err) {
      console.warn(`Warning: could not create backup at ${backupPath}: ${err}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
