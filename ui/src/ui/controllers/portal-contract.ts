import type { GatewayBrowserClient } from "../gateway.ts";
import type { PortalContract } from "../types.ts";

export type PortalContractState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  portalContractLoading: boolean;
  portalContract: PortalContract | null;
  portalContractError: string | null;
};

const SUPPORTED_PORTAL_SPEC_VERSION = "2026-02-21";

function normalizePortalContract(input: unknown): PortalContract | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const value = input as Record<string, unknown>;
  if (typeof value.specVersion !== "string" || !value.specVersion.trim()) {
    return null;
  }
  return {
    specVersion: value.specVersion,
    chatFirst: value.chatFirst !== false,
    richBlocks:
      value.richBlocks && typeof value.richBlocks === "object"
        ? (value.richBlocks as PortalContract["richBlocks"])
        : undefined,
    asyncResume:
      value.asyncResume && typeof value.asyncResume === "object"
        ? (value.asyncResume as PortalContract["asyncResume"])
        : undefined,
  };
}

export async function loadPortalContract(state: PortalContractState) {
  if (!state.client || !state.connected) {
    return;
  }
  state.portalContractLoading = true;
  state.portalContractError = null;
  try {
    const response = await state.client.request<unknown>("chat.portal.contract", {});
    const normalized = normalizePortalContract(response);
    if (!normalized) {
      state.portalContract = null;
      state.portalContractError = "invalid portal contract payload";
      return;
    }
    state.portalContract = normalized;
    if (normalized.specVersion !== SUPPORTED_PORTAL_SPEC_VERSION) {
      state.portalContractError = `unsupported portal contract specVersion: ${normalized.specVersion}`;
    }
  } catch (err) {
    state.portalContract = null;
    state.portalContractError = String(err);
  } finally {
    state.portalContractLoading = false;
  }
}
