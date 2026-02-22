function parseTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

/**
 * Backend rollout flag for providers RPC methods.
 * Default: enabled.
 */
export function isProvidersRpcEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.OPENCLAW_PROVIDERS_RPC_ENABLED;
  if (raw == null || raw.trim() === "") {
    return true;
  }
  return parseTruthy(raw);
}

