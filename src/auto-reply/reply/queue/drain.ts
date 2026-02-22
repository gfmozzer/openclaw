import { defaultRuntime } from "../../../runtime.js";
import {
  buildCollectPrompt,
  clearQueueSummaryState,
  drainCollectItemIfNeeded,
  drainNextQueueItem,
  hasCrossChannelItems,
  previewQueueSummaryPrompt,
} from "../../../utils/queue-helpers.js";
import { isRoutableChannel } from "../route-reply.js";
import { enqueueFollowupJob } from "./bullmq-followup-queue.js";
import { clearFollowupQueueState, getFollowupQueueState, saveFollowupQueueState } from "./state.js";
import type { FollowupRun } from "./types.js";

export async function processFollowupDrain(
  key: string,
  runFollowup: (run: FollowupRun) => Promise<void>,
): Promise<void> {
  const queue = await getFollowupQueueState(key);
  if (!queue) {
    return;
  }

  try {
    let forceIndividualCollect = false;
    
    // Process items in batch. The delay/debounce has already happened via BullMQ.
    while (queue.items.length > 0 || queue.droppedCount > 0) {
      if (queue.mode === "collect") {
        const isCrossChannel = hasCrossChannelItems(queue.items, (item) => {
          const channel = item.originatingChannel;
          const to = item.originatingTo;
          const accountId = item.originatingAccountId;
          const threadId = item.originatingThreadId;
          if (!channel && !to && !accountId && threadId == null) {
            return {};
          }
          if (!isRoutableChannel(channel) || !to) {
            return { cross: true };
          }
          const threadKey = threadId != null ? String(threadId) : "";
          return {
            key: [channel, to, accountId || "", threadKey].join("|"),
          };
        });

        const collectDrainResult = await drainCollectItemIfNeeded({
          forceIndividualCollect,
          isCrossChannel,
          setForceIndividualCollect: (next) => {
            forceIndividualCollect = next;
          },
          items: queue.items,
          run: runFollowup,
        });
        if (collectDrainResult === "empty") {
          break;
        }
        if (collectDrainResult === "drained") {
          continue;
        }

        const items = queue.items.slice();
        const summary = previewQueueSummaryPrompt({ state: queue, noun: "message" });
        const run = items.at(-1)?.run ?? queue.lastRun;
        if (!run) {
          clearQueueSummaryState(queue);
          break;
        }

        if (items.length === 0) {
          // Send summary only if present
          if (summary) {
            await runFollowup({
              prompt: buildCollectPrompt({
                title: "[Queued messages while agent was busy]",
                items,
                summary,
                renderItem: (item, idx) => `---\nQueued #${idx + 1}\n${(item as any).prompt}`.trim(),
              }),
              run,
              enqueuedAt: Date.now(),
            });
            clearQueueSummaryState(queue);
          }
          continue;
        }

        const originatingChannel = items.find((i) => i.originatingChannel)?.originatingChannel;
        const originatingTo = items.find((i) => i.originatingTo)?.originatingTo;
        const originatingAccountId = items.find(
          (i) => i.originatingAccountId,
        )?.originatingAccountId;
        const originatingThreadId = items.find(
          (i) => i.originatingThreadId != null,
        )?.originatingThreadId;

        const prompt = buildCollectPrompt({
          title: "[Queued messages while agent was busy]",
          items,
          summary,
          renderItem: (item, idx) => `---\nQueued #${idx + 1}\n${item.prompt}`.trim(),
        });
        await runFollowup({
          prompt,
          run,
          enqueuedAt: Date.now(),
          originatingChannel,
          originatingTo,
          originatingAccountId,
          originatingThreadId,
        });
        queue.items.splice(0, items.length);
        if (summary) {
          clearQueueSummaryState(queue);
        }
        continue;
      }

      const summaryPrompt = previewQueueSummaryPrompt({ state: queue, noun: "message" });
      if (summaryPrompt) {
        const run = queue.lastRun;
        if (!run) {
          clearQueueSummaryState(queue);
          break;
        }

        if (queue.items.length === 0) {
          // No items to attach summary to, so we send the summary as a standalone message
          await runFollowup({
            prompt: summaryPrompt,
            run,
            enqueuedAt: Date.now(),
          });
          clearQueueSummaryState(queue);
          continue;
        }

        if (
          !(await drainNextQueueItem(queue.items, async () => {
            await runFollowup({
              prompt: summaryPrompt,
              run,
              enqueuedAt: Date.now(),
            });
          }))
        ) {
          clearQueueSummaryState(queue);
          break;
        }
        clearQueueSummaryState(queue);
        continue;
      }

      if (!(await drainNextQueueItem(queue.items, runFollowup))) {
        clearQueueSummaryState(queue);
        break;
      }
    }
  } catch (err) {
    queue.lastEnqueuedAt = Date.now();
    defaultRuntime.error?.(`followup queue drain failed for ${key}: ${String(err)}`);
    // Rethrow to let BullMQ handle retries, but save state so we don't lose items processed so far
    await saveFollowupQueueState(key, queue);
    throw err; 
  } finally {
    if (queue.items.length === 0 && queue.droppedCount === 0) {
      await clearFollowupQueueState(key);
    } else {
      await saveFollowupQueueState(key, queue);
      // If there are still items left over (e.g. max processing limits or break), re-trigger drain
      await enqueueFollowupJob(key, 100); 
    }
  }
}
