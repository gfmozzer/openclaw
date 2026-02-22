import { beforeEach, describe, expect, it, vi } from "vitest";

const createWorkerMock = vi.fn();

vi.mock("./bullmq-queue-factory.js", () => ({
  createWorker: createWorkerMock,
}));

type WorkerProcessor = (job: { data: unknown }) => Promise<void>;

describe("plan3-workers", () => {
  beforeEach(() => {
    createWorkerMock.mockReset();
  });

  it("qmd worker resolves manager by lookup and calls sync with reason/force", async () => {
    const sync = vi.fn().mockResolvedValue(undefined);
    createWorkerMock.mockReturnValue({ close: vi.fn() });

    const { startQmdUpdateWorker } = await import("./plan3-workers.js");
    startQmdUpdateWorker(async () => ({ sync }));

    const processor = createWorkerMock.mock.calls[0]?.[1] as WorkerProcessor;
    expect(processor).toBeTypeOf("function");

    await processor({
      data: { agentId: "agent-a", reason: "forced-update", force: true },
    });

    expect(sync).toHaveBeenCalledWith({ reason: "forced-update", force: true });
  });

  it("qmd worker throws when manager lookup returns null", async () => {
    createWorkerMock.mockReturnValue({ close: vi.fn() });

    const { startQmdUpdateWorker } = await import("./plan3-workers.js");
    startQmdUpdateWorker(async () => null);

    const processor = createWorkerMock.mock.calls[0]?.[1] as WorkerProcessor;
    await expect(processor({ data: { agentId: "agent-a" } })).rejects.toThrow(
      "manager not found",
    );
  });

  it("memory worker calls sync with bullmq-interval reason", async () => {
    const sync = vi.fn().mockResolvedValue(undefined);
    createWorkerMock.mockReturnValue({ close: vi.fn() });

    const { startMemorySyncWorker } = await import("./plan3-workers.js");
    startMemorySyncWorker(async () => ({ sync }));

    const processor = createWorkerMock.mock.calls[0]?.[1] as WorkerProcessor;
    await processor({ data: { agentId: "agent-memory" } });

    expect(sync).toHaveBeenCalledWith({ reason: "bullmq-interval" });
  });
});

