import type { GatewayBrowserClient } from "../gateway.ts";
import type { PortalStackStatus } from "../types.ts";

export type PortalStackState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  portalStackLoading: boolean;
  portalStackStatus: PortalStackStatus | null;
  portalStackError: string | null;
};

export async function loadPortalStackStatus(state: PortalStackState) {
  if (!state.client || !state.connected) {
    return;
  }
  state.portalStackLoading = true;
  state.portalStackError = null;
  try {
    const response = await state.client.request<PortalStackStatus>("chat.portal.stack.status", {});
    state.portalStackStatus = response;
  } catch (err) {
    state.portalStackError = String(err);
  } finally {
    state.portalStackLoading = false;
  }
}
