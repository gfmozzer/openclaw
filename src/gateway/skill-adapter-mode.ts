export type SkillAdapterMode = "local" | "remote";

export function resolveSkillAdapterMode(env: NodeJS.ProcessEnv = process.env): SkillAdapterMode {
  const raw = (env.OPENCLAW_SKILL_ADAPTER_MODE ?? "local").trim().toLowerCase();
  return raw === "remote" ? "remote" : "local";
}
