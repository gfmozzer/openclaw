import type { GatewayBrowserClient } from "../gateway.ts";
import type { SkillStatusReport } from "../types.ts";

export type SkillsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  skillsLoading: boolean;
  skillsReport: SkillStatusReport | null;
  skillsError: string | null;
  skillsBusyKey: string | null;
  skillEdits: Record<string, string>;
  skillMessages: SkillMessageMap;
  skillTestResults: Record<string, string>;
};

export type SkillMessage = {
  kind: "success" | "error";
  message: string;
};

export type SkillMessageMap = Record<string, SkillMessage>;

type LoadSkillsOptions = {
  clearMessages?: boolean;
};

const EXTERNAL_ENDPOINT_KEY = "OPENCLAW_EXTERNAL_ENDPOINT";
const EXTERNAL_POLICY_KEY = "OPENCLAW_EXTERNAL_POLICY";
const EXTERNAL_ENDPOINT_EDIT_SUFFIX = "::external-endpoint";
const EXTERNAL_POLICY_EDIT_SUFFIX = "::external-policy";
const EXTERNAL_TEST_PAYLOAD_EDIT_SUFFIX = "::external-test-payload";

function externalEndpointEditKey(skillKey: string): string {
  return `${skillKey}${EXTERNAL_ENDPOINT_EDIT_SUFFIX}`;
}

function externalPolicyEditKey(skillKey: string): string {
  return `${skillKey}${EXTERNAL_POLICY_EDIT_SUFFIX}`;
}

function externalTestPayloadEditKey(skillKey: string): string {
  return `${skillKey}${EXTERNAL_TEST_PAYLOAD_EDIT_SUFFIX}`;
}

function setSkillMessage(state: SkillsState, key: string, message?: SkillMessage) {
  if (!key.trim()) {
    return;
  }
  const next = { ...state.skillMessages };
  if (message) {
    next[key] = message;
  } else {
    delete next[key];
  }
  state.skillMessages = next;
}

function getErrorMessage(err: unknown) {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export async function loadSkills(state: SkillsState, options?: LoadSkillsOptions) {
  if (options?.clearMessages && Object.keys(state.skillMessages).length > 0) {
    state.skillMessages = {};
  }
  if (!state.client || !state.connected) {
    return;
  }
  if (state.skillsLoading) {
    return;
  }
  state.skillsLoading = true;
  state.skillsError = null;
  try {
    const res = await state.client.request<SkillStatusReport | undefined>("skills.status", {});
    if (res) {
      state.skillsReport = res;
    }
  } catch (err) {
    state.skillsError = getErrorMessage(err);
  } finally {
    state.skillsLoading = false;
  }
}

export function updateSkillEdit(state: SkillsState, skillKey: string, value: string) {
  state.skillEdits = { ...state.skillEdits, [skillKey]: value };
}

export function updateSkillExternalEndpointEdit(state: SkillsState, skillKey: string, value: string) {
  state.skillEdits = { ...state.skillEdits, [externalEndpointEditKey(skillKey)]: value };
}

export function updateSkillExternalPolicyEdit(state: SkillsState, skillKey: string, value: string) {
  state.skillEdits = { ...state.skillEdits, [externalPolicyEditKey(skillKey)]: value };
}

export function updateSkillExternalTestPayloadEdit(
  state: SkillsState,
  skillKey: string,
  value: string,
) {
  state.skillEdits = { ...state.skillEdits, [externalTestPayloadEditKey(skillKey)]: value };
}

export async function updateSkillEnabled(state: SkillsState, skillKey: string, enabled: boolean) {
  if (!state.client || !state.connected) {
    return;
  }
  state.skillsBusyKey = skillKey;
  state.skillsError = null;
  try {
    await state.client.request("skills.update", { skillKey, enabled });
    await loadSkills(state);
    setSkillMessage(state, skillKey, {
      kind: "success",
      message: enabled ? "Skill enabled" : "Skill disabled",
    });
  } catch (err) {
    const message = getErrorMessage(err);
    state.skillsError = message;
    setSkillMessage(state, skillKey, {
      kind: "error",
      message,
    });
  } finally {
    state.skillsBusyKey = null;
  }
}

export async function saveSkillApiKey(state: SkillsState, skillKey: string) {
  if (!state.client || !state.connected) {
    return;
  }
  state.skillsBusyKey = skillKey;
  state.skillsError = null;
  try {
    const apiKey = state.skillEdits[skillKey] ?? "";
    await state.client.request("skills.update", { skillKey, apiKey });
    await loadSkills(state);
    setSkillMessage(state, skillKey, {
      kind: "success",
      message: "API key saved",
    });
  } catch (err) {
    const message = getErrorMessage(err);
    state.skillsError = message;
    setSkillMessage(state, skillKey, {
      kind: "error",
      message,
    });
  } finally {
    state.skillsBusyKey = null;
  }
}

export async function saveSkillExternalConfig(state: SkillsState, skillKey: string) {
  if (!state.client || !state.connected) {
    return;
  }
  state.skillsBusyKey = skillKey;
  state.skillsError = null;
  try {
    const endpoint = state.skillEdits[externalEndpointEditKey(skillKey)] ?? "";
    const policy = state.skillEdits[externalPolicyEditKey(skillKey)] ?? "";
    await state.client.request("skills.update", {
      skillKey,
      env: {
        [EXTERNAL_ENDPOINT_KEY]: endpoint,
        [EXTERNAL_POLICY_KEY]: policy,
      },
    });
    await loadSkills(state);
    setSkillMessage(state, skillKey, {
      kind: "success",
      message: "External endpoint/policy saved",
    });
  } catch (err) {
    const message = getErrorMessage(err);
    state.skillsError = message;
    setSkillMessage(state, skillKey, {
      kind: "error",
      message,
    });
  } finally {
    state.skillsBusyKey = null;
  }
}

export async function testSkillExternalEndpoint(state: SkillsState, skillKey: string) {
  if (!state.client || !state.connected) {
    return;
  }
  state.skillsBusyKey = skillKey;
  state.skillsError = null;
  try {
    const endpoint = state.skillEdits[externalEndpointEditKey(skillKey)] ?? "";
    const payload = state.skillEdits[externalTestPayloadEditKey(skillKey)] ?? "";
    const result = await state.client.request<{
      ok: boolean;
      endpoint: string;
      status: number;
      latencyMs: number;
      bodyPreview: string;
      transportError?: string;
    }>("skills.remote.test", {
      skillKey,
      endpoint: endpoint.trim() || undefined,
      payload,
      timeoutMs: 10000,
    });
    const summary = [
      `endpoint=${result.endpoint}`,
      `status=${result.status}`,
      `latency=${result.latencyMs}ms`,
      result.transportError ? `error=${result.transportError}` : undefined,
    ]
      .filter(Boolean)
      .join(" | ");
    state.skillTestResults = {
      ...state.skillTestResults,
      [skillKey]: result.bodyPreview || "(empty response body)",
    };
    setSkillMessage(state, skillKey, {
      kind: result.ok ? "success" : "error",
      message: summary,
    });
  } catch (err) {
    const message = getErrorMessage(err);
    state.skillsError = message;
    setSkillMessage(state, skillKey, {
      kind: "error",
      message,
    });
  } finally {
    state.skillsBusyKey = null;
  }
}

export function getSkillExternalEndpointEdit(state: SkillsState, skillKey: string): string {
  return state.skillEdits[externalEndpointEditKey(skillKey)] ?? "";
}

export function getSkillExternalPolicyEdit(state: SkillsState, skillKey: string): string {
  return state.skillEdits[externalPolicyEditKey(skillKey)] ?? "";
}

export function getSkillExternalTestPayloadEdit(state: SkillsState, skillKey: string): string {
  return state.skillEdits[externalTestPayloadEditKey(skillKey)] ?? "";
}

export async function installSkill(
  state: SkillsState,
  skillKey: string,
  name: string,
  installId: string,
) {
  if (!state.client || !state.connected) {
    return;
  }
  state.skillsBusyKey = skillKey;
  state.skillsError = null;
  try {
    const result = await state.client.request<{ message?: string }>("skills.install", {
      name,
      installId,
      timeoutMs: 120000,
    });
    await loadSkills(state);
    setSkillMessage(state, skillKey, {
      kind: "success",
      message: result?.message ?? "Installed",
    });
  } catch (err) {
    const message = getErrorMessage(err);
    state.skillsError = message;
    setSkillMessage(state, skillKey, {
      kind: "error",
      message,
    });
  } finally {
    state.skillsBusyKey = null;
  }
}
