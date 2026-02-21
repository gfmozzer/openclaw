import { resolveSkillAdapterMode } from "../../gateway/skill-adapter-mode.js";
import { createHttpToolBusDispatcherFromEnv } from "../../gateway/stateless/adapters/node/http-tool-bus-dispatcher.js";
import type { MsgContext } from "../templating.js";

export type SkillToolBusDispatchParams = {
  ctx: MsgContext;
  sessionKey: string;
  agentId: string;
  skillName: string;
  commandName: string;
  toolName: string;
  command: string;
};

export async function dispatchSkillToolViaBus(
  params: SkillToolBusDispatchParams,
): Promise<{ ok: boolean; outputText?: string; errorMessage?: string } | null> {
  if (resolveSkillAdapterMode() !== "remote") {
    return null;
  }
  const dispatcher = createHttpToolBusDispatcherFromEnv();
  if (!dispatcher) {
    return {
      ok: false,
      errorMessage:
        "Skill adapter is in remote mode, but OPENCLAW_SKILL_TOOLBUS_ENDPOINT is not configured.",
    };
  }
  const result = await dispatcher.dispatch({
    tenantId: params.ctx.TenantId,
    agentId: params.agentId,
    sessionKey: params.sessionKey,
    skillName: params.skillName,
    commandName: params.commandName,
    toolName: params.toolName,
    command: params.command,
    provider: params.ctx.Provider,
    surface: params.ctx.Surface,
    accountId: params.ctx.AccountId,
    to: params.ctx.OriginatingTo ?? params.ctx.To,
    threadId: params.ctx.MessageThreadId,
    metadata: {
      tenantUserId: params.ctx.TenantUserId,
      tenantPhoneNumber: params.ctx.TenantPhoneNumber,
      from: params.ctx.From,
      senderId: params.ctx.SenderId,
      senderUsername: params.ctx.SenderUsername,
    },
  });
  if (!result.ok) {
    return {
      ok: false,
      errorMessage: result.error?.message ?? "Remote tool bus execution failed.",
    };
  }
  return {
    ok: true,
    outputText: result.outputText,
  };
}
