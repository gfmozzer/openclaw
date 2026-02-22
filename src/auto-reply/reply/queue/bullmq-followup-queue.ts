import { createQueue, createWorker, isRedisAvailable } from "../../../gateway/stateless/adapters/redis/index.js";
import type { Queue } from "bullmq";

let followupQueue: Queue | undefined;

function getQueue() {
  if (!followupQueue) {
    followupQueue = createQueue("followup-drain");
  }
  return followupQueue;
}

export async function enqueueFollowupJob(
  key: string,
  debounceMs = 1000
): Promise<void> {
  if (!isRedisAvailable()) {
    return;
  }
  
  // Add a debounced trigger in BullMQ. 
  // Using jobId = key ensures we don't queue multiple delayed triggers for the same queue.
  await getQueue().add(
    `drain:${key}`,
    { key },
    {
      delay: debounceMs,
      jobId: `followup_drain_${key}`,
      removeOnComplete: { age: 300 },
    }
  );
}

export function startFollowupWorker(
  processor: (key: string) => Promise<void>
) {
  if (!isRedisAvailable()) {
    return undefined; // Or throw, but returning undefined is safer
  }
  return createWorker("followup-drain", async (job) => {
    await processor(job.data.key);
  }, { concurrency: 5 });
}

export async function clearAllFollowupJobsFor(key: string) {
  if (!isRedisAvailable()) return;

  const jobId = `followup_drain_${key}`;
  const job = await getQueue().getJob(jobId);
  if (job) {
    await job.remove();
  }
}
