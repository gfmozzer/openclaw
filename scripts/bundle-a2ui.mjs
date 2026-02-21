#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hashFile = path.join(rootDir, "src/canvas-host/a2ui/.bundle.hash");
const outputFile = path.join(rootDir, "src/canvas-host/a2ui/a2ui.bundle.js");
const a2uiRendererDir = path.join(rootDir, "vendor/a2ui/renderers/lit");
const a2uiAppDir = path.join(rootDir, "apps/shared/OpenClawKit/Tools/CanvasA2UI");

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: true,
    cwd: rootDir,
  });
  if (result.status !== 0) {
    throw new Error(`command failed: ${cmd} ${args.join(" ")}`);
  }
}

async function walk(entryPath, files) {
  const st = await stat(entryPath);
  if (st.isDirectory()) {
    const entries = await readdir(entryPath);
    for (const entry of entries) {
      await walk(path.join(entryPath, entry), files);
    }
    return;
  }
  files.push(entryPath);
}

async function computeHash(inputPaths) {
  const files = [];
  for (const input of inputPaths) {
    await walk(input, files);
  }
  files.sort((a, b) =>
    path.relative(rootDir, a).replaceAll(path.sep, "/").localeCompare(
      path.relative(rootDir, b).replaceAll(path.sep, "/"),
    ),
  );

  const hash = createHash("sha256");
  for (const filePath of files) {
    const rel = path.relative(rootDir, filePath).replaceAll(path.sep, "/");
    hash.update(rel);
    hash.update("\0");
    hash.update(await readFile(filePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function main() {
  const hasSources = existsSync(a2uiRendererDir) && existsSync(a2uiAppDir);
  if (!hasSources) {
    if (existsSync(outputFile)) {
      console.log("A2UI sources missing; keeping prebuilt bundle.");
      return;
    }
    throw new Error(`A2UI sources missing and no prebuilt bundle found at: ${outputFile}`);
  }

  const inputPaths = [
    path.join(rootDir, "package.json"),
    path.join(rootDir, "pnpm-lock.yaml"),
    a2uiRendererDir,
    a2uiAppDir,
  ];

  const currentHash = await computeHash(inputPaths);
  if (existsSync(hashFile) && existsSync(outputFile)) {
    const previousHash = (await readFile(hashFile, "utf8")).trim();
    if (previousHash === currentHash) {
      console.log("A2UI bundle up to date; skipping.");
      return;
    }
  }

  run("pnpm", ["-s", "exec", "tsc", "-p", a2uiRendererDir + "/tsconfig.json"]);
  const hasRolldown = spawnSync("rolldown", ["--version"], { shell: true }).status === 0;
  if (hasRolldown) {
    run("rolldown", ["-c", a2uiAppDir + "/rolldown.config.mjs"]);
  } else {
    run("pnpm", ["-s", "dlx", "rolldown", "-c", a2uiAppDir + "/rolldown.config.mjs"]);
  }

  await mkdir(path.dirname(hashFile), { recursive: true });
  await writeFile(hashFile, `${currentHash}\n`, "utf8");
}

main().catch((err) => {
  console.error("A2UI bundling failed. Re-run with: pnpm canvas:a2ui:bundle");
  console.error("If this persists, verify pnpm deps and try again.");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
