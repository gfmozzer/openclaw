import { applyQueueDropPolicy, shouldSkipQueueItem } from "../../../utils/queue-helpers.js";
import { enqueueFollowupJob } from "./bullmq-followup-queue.js";
import { getFollowupQueueState, saveFollowupQueueState } from "./state.js";
import type { FollowupRun, QueueDedupeMode, QueueSettings } from "./types.js";

function isRunAlreadyQueued(
  run: FollowupRun,
  items: FollowupRun[],
  allowPromptFallback = false,
): boolean {
  const hasSameRouting = (item: FollowupRun) =>
    item.originatingChannel === run.originatingChannel &&
    item.originatingTo === run.originatingTo &&
    item.originatingAccountId === run.originatingAccountId &&
    item.originatingThreadId === run.originatingThreadId;

  const messageId = run.messageId?.trim();
  if (messageId) {
    return items.some((item) => item.messageId?.trim() === messageId && hasSameRouting(item));
  }
  if (!allowPromptFallback) {
    return false;
  }
  return items.some((item) => item.prompt === run.prompt && hasSameRouting(item));
}

export async function enqueueFollowupRun(
  key: string,
  run: FollowupRun,
  settings: QueueSettings,
  dedupeMode: QueueDedupeMode = "message-id",
): Promise<boolean> {
  const queue = await getFollowupQueueState(key, settings);
  const dedupe =
    dedupeMode === "none"
      ? undefined
      : (item: FollowupRun, items: FollowupRun[]) =>
          isRunAlreadyQueued(item, items, dedupeMode === "prompt");

  // Deduplicate: skip if the same message is already queued.
  if (shouldSkipQueueItem({ item: run, items: queue.items, dedupe })) {
    return false;
  }

  queue.lastEnqueuedAt = Date.now();
  queue.lastRun = run.run;

  const shouldEnqueue = applyQueueDropPolicy({
    queue,
    summarize: (item) => item.summaryLine?.trim() || item.prompt.trim(),
  });
  if (!shouldEnqueue) {
    return false;
  }

  queue.items.push(run);
  
  // Save updated state to Redis
  await saveFollowupQueueState(key, queue);
  
  // Trigger debounced drain via BullMQ
  await enqueueFollowupJob(key, queue.debounceMs);
  
  return true;
}

export async function getFollowupQueueDepth(key: string, settings: QueueSettings): Promise<number> {
  const cleaned = key.trim();
  if (!cleaned) {
    return 0;
  }
  const queue = await getFollowupQueueState(cleaned, settings);
  return queue.items.length;
}
