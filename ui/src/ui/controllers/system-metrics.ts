import type { GatewayBrowserClient } from "../gateway.ts";
import type { EnterpriseMetricsSnapshot } from "../types.ts";

export type SystemMetricsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  enterpriseMetricsLoading: boolean;
  enterpriseMetricsError: string | null;
  enterpriseMetrics: EnterpriseMetricsSnapshot | null;
};

export async function loadSystemMetrics(state: SystemMetricsState) {
  if (!state.client || !state.connected || state.enterpriseMetricsLoading) {
    return;
  }
  state.enterpriseMetricsLoading = true;
  state.enterpriseMetricsError = null;
  try {
    const res = await state.client.request<EnterpriseMetricsSnapshot>("system.metrics", {});
    state.enterpriseMetrics = res ?? null;
  } catch (err) {
    state.enterpriseMetricsError = String(err);
  } finally {
    state.enterpriseMetricsLoading = false;
  }
}
