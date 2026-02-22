import { loadSessionStore } from "../../../config/sessions.js";
import { defaultRuntime } from "../../../runtime.js";
import { resolveStorePath } from "../../../config/sessions/paths.js";
import { type TypingController } from "../typing.js";
import { createFollowupRunner } from "../followup-runner.js";
import { processFollowupDrain } from "../queue/drain.js";

// A dummy typing controller since background workers do not hold active websocket connections
const createDummyTypingController = (): TypingController => ({
  onReplyStart: async () => {},
  startTypingLoop: async () => {},
  startTypingOnText: async () => {},
  refreshTypingTtl: () => {},
  isActive: () => false,
  markRunComplete: () => {},
  markDispatchIdle: () => {},
  cleanup: () => {},
});

export async function executeFollowupWorkerJob(key: string): Promise<void> {
  // Since we don't have the original runFollowup closure, we must recreate it.
  // The state (queue items) contains the `FollowupRun` contexts we need.
  // We'll peek into the first queued item to derive the necessary runner options.
  const { getFollowupQueueState } = await import("../queue/state.js");
  const queue = await getFollowupQueueState(key);
  
  if (!queue || queue.items.length === 0) {
    return;
  }

  const firstRun = queue.items[0];
  const config = firstRun.run.config;
  
  // Reconstruct the store and typing objects
  const storePath = resolveStorePath(config.session?.store, { agentId: firstRun.run.agentId });
  const sessionStore = storePath ? loadSessionStore(storePath) : undefined;
  const sessionKey = firstRun.run.sessionKey;
  const sessionEntry = sessionKey && sessionStore ? sessionStore[sessionKey] : undefined;

  const runFollowupTurn = createFollowupRunner({
    typing: createDummyTypingController(),
    typingMode: config.agents?.defaults?.typingMode ?? "message",
    sessionEntry,
    sessionStore,
    sessionKey,
    storePath,
    defaultModel: firstRun.run.model,
    agentCfgContextTokens: undefined, 
  });

  await processFollowupDrain(key, runFollowupTurn);
}
