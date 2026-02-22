/// <reference types="vite/client" />

function parseTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isProvidersUiEnabled(runtimeMethods?: string[]): boolean {
  const envEnabled = parseTruthy(import.meta.env.VITE_OPENCLAW_PROVIDERS_UI_ENABLED ?? "1");
  if (!envEnabled) {
    return false;
  }
  if (!Array.isArray(runtimeMethods) || runtimeMethods.length === 0) {
    return true;
  }
  return (
    runtimeMethods.includes("providers.registry.list") ||
    runtimeMethods.includes("drivers.registry.list")
  );
}
