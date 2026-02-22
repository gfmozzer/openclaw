type EnterpriseMetricName =
  | "auth_denied_total"
  | "schedule_requests_total"
  | "schedule_denied_total"
  | "workflow_resume_failures_total"
  | "idempotency_lock_failures_total"
  | "chat_audio_requests_total"
  | "chat_dashboard_responses_total"
  | "chat_tool_authorization_denied_total"
  | "chat_async_resume_total"
  | "chat_async_resume_failures_total"
  | "byok_override_accepted_total"
  | "provider_credential_upsert_total"
  | "provider_credential_test_total"
  | "provider_models_discovery_fail_total";

type EnterpriseMetricsSnapshot = {
  generatedAt: number;
  counters: Record<EnterpriseMetricName, number>;
};

const counters: Record<EnterpriseMetricName, number> = {
  auth_denied_total: 0,
  schedule_requests_total: 0,
  schedule_denied_total: 0,
  workflow_resume_failures_total: 0,
  idempotency_lock_failures_total: 0,
  chat_audio_requests_total: 0,
  chat_dashboard_responses_total: 0,
  chat_tool_authorization_denied_total: 0,
  chat_async_resume_total: 0,
  chat_async_resume_failures_total: 0,
  byok_override_accepted_total: 0,
  provider_credential_upsert_total: 0,
  provider_credential_test_total: 0,
  provider_models_discovery_fail_total: 0,
};

let lastUpdatedAt = Date.now();

export function incrementEnterpriseMetric(name: EnterpriseMetricName, by = 1): void {
  const delta = Number.isFinite(by) ? Math.max(0, Math.floor(by)) : 0;
  if (delta <= 0) {
    return;
  }
  counters[name] += delta;
  lastUpdatedAt = Date.now();
}

export function getEnterpriseMetricsSnapshot(): EnterpriseMetricsSnapshot {
  return {
    generatedAt: lastUpdatedAt,
    counters: { ...counters },
  };
}

export function resetEnterpriseMetricsForTest(): void {
  counters.auth_denied_total = 0;
  counters.schedule_requests_total = 0;
  counters.schedule_denied_total = 0;
  counters.workflow_resume_failures_total = 0;
  counters.idempotency_lock_failures_total = 0;
  counters.chat_audio_requests_total = 0;
  counters.chat_dashboard_responses_total = 0;
  counters.chat_tool_authorization_denied_total = 0;
  counters.chat_async_resume_total = 0;
  counters.chat_async_resume_failures_total = 0;
  counters.byok_override_accepted_total = 0;
  counters.provider_credential_upsert_total = 0;
  counters.provider_credential_test_total = 0;
  counters.provider_models_discovery_fail_total = 0;
  lastUpdatedAt = Date.now();
}
