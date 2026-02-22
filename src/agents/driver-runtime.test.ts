import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  preloadExternalDrivers,
  resetDriverRuntimeCacheForTest,
  resolveDriverRuntime,
} from "./driver-runtime.js";

afterEach(() => {
  resetDriverRuntimeCacheForTest();
});

describe("resolveDriverRuntime", () => {
  it("defaults to native driver when no env is configured", () => {
    const runtime = resolveDriverRuntime({ env: {} });
    expect(runtime.defaultDriver).toBe("native");
    expect(runtime.enabledDrivers).toEqual(["native"]);
    expect(runtime.loadedDrivers).toEqual(["native"]);
    expect(runtime.failedDrivers).toEqual([]);
  });

  it("enables built-in drivers from OPENCLAW_DRIVERS_ENABLED", () => {
    const runtime = resolveDriverRuntime({
      env: {
        OPENCLAW_DRIVERS_ENABLED: "native, litellm",
        OPENCLAW_DRIVER_DEFAULT: "litellm",
      },
    });
    expect(runtime.defaultDriver).toBe("litellm");
    expect(runtime.enabledDrivers).toEqual(["litellm", "native"]);
    expect(runtime.loadedDrivers).toEqual(["litellm", "native"]);
    expect(runtime.failedDrivers).toEqual([]);
  });

  it("reports external enabled drivers as not loaded when preloader did not run", () => {
    const runtime = resolveDriverRuntime({
      env: {
        OPENCLAW_DRIVERS_ENABLED: "native,acme-fal",
        OPENCLAW_DRIVER_ACME_FAL_ENABLED: "1",
        OPENCLAW_DRIVER_ACME_FAL_ENTRY: "./drivers/fal.ts",
      },
    });
    expect(runtime.enabledDrivers).toEqual(["acme-fal", "native"]);
    expect(runtime.loadedDrivers).toEqual(["native"]);
    expect(runtime.failedDrivers).toEqual([
      {
        driverId: "acme-fal",
        reason: "external driver preloader has not run for current env",
      },
    ]);
  });

  it("keeps external driver disabled unless OPENCLAW_DRIVER_<ID>_ENABLED is true", () => {
    const runtime = resolveDriverRuntime({
      env: {
        OPENCLAW_DRIVERS_ENABLED: "native,acme-fal",
        OPENCLAW_DRIVER_ACME_FAL_ENTRY: "./drivers/fal.ts",
      },
    });
    expect(runtime.enabledDrivers).toEqual(["native"]);
    expect(runtime.loadedDrivers).toEqual(["native"]);
    expect(runtime.failedDrivers).toEqual([]);
  });

  it("loads external driver from local entry when preloader succeeds", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-driver-runtime-"));
    const entryPath = path.join(tempDir, "driver.mjs");
    await fs.writeFile(entryPath, "export const id = 'fal';\n", "utf8");
    const env = {
      OPENCLAW_DRIVERS_ENABLED: "native,acme-fal",
      OPENCLAW_DRIVER_ACME_FAL_ENABLED: "1",
      OPENCLAW_DRIVER_ACME_FAL_ENTRY: entryPath,
    };

    await preloadExternalDrivers({ env, cwd: tempDir });
    const runtime = resolveDriverRuntime({ env });

    expect(runtime.enabledDrivers).toEqual(["acme-fal", "native"]);
    expect(runtime.loadedDrivers).toEqual(["acme-fal", "native"]);
    expect(runtime.failedDrivers).toEqual([]);
  });

  it("loads external driver from package when preloader succeeds", async () => {
    const env = {
      OPENCLAW_DRIVERS_ENABLED: "native,tooling",
      OPENCLAW_DRIVER_TOOLING_ENABLED: "1",
      OPENCLAW_DRIVER_TOOLING_PACKAGE: "@sinclair/typebox",
    };

    await preloadExternalDrivers({ env });
    const runtime = resolveDriverRuntime({ env });

    expect(runtime.enabledDrivers).toEqual(["native", "tooling"]);
    expect(runtime.loadedDrivers).toEqual(["native", "tooling"]);
    expect(runtime.failedDrivers).toEqual([]);
  });

  it("falls back to native when toggles disable every configured driver", () => {
    const runtime = resolveDriverRuntime({
      env: {
        OPENCLAW_DRIVERS_ENABLED: "litellm",
        OPENCLAW_DRIVER_LITELLM_ENABLED: "0",
      },
    });
    expect(runtime.defaultDriver).toBe("native");
    expect(runtime.enabledDrivers).toEqual(["native"]);
    expect(runtime.loadedDrivers).toEqual(["native"]);
  });
});
