import type { OpenClawConfig } from "../../../config/config.js";
import type { SkillCommandDispatchSpec } from "../../../agents/skills/types.js";

export type SkillManifest = {
  name: string;
  description: string;
  sourcePath: string;
  commandName?: string;
  dispatch?: SkillCommandDispatchSpec;
  disableModelInvocation: boolean;
  userInvocable: boolean;
  metadata?: Record<string, unknown>;
};

export type SkillLoadRequest = {
  workspaceDir: string;
  config: OpenClawConfig;
  skillFilter?: string[];
};

export interface SkillLoader {
  loadManifests(request: SkillLoadRequest): Promise<SkillManifest[]>;
}
