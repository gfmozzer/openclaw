export type CronOrchestrationMode = "local" | "temporal";

export function resolveCronOrchestrationMode(
  env: NodeJS.ProcessEnv = process.env,
): CronOrchestrationMode {
  const raw = (env.OPENCLAW_CRON_ORCHESTRATION_MODE ?? "local").trim().toLowerCase();
  return raw === "temporal" ? "temporal" : "local";
}
