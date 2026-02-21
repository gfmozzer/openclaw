import type { SkillLoader, SkillManifest, SkillLoadRequest } from "../../contracts/skill-loader.js";
import {
  buildWorkspaceSkillCommandSpecs,
  loadWorkspaceSkillEntries,
} from "../../../../agents/skills.js";

export class NodeWorkspaceSkillLoader implements SkillLoader {
  async loadManifests(request: SkillLoadRequest): Promise<SkillManifest[]> {
    const entries = loadWorkspaceSkillEntries(request.workspaceDir, {
      config: request.config,
    });
    const commands = buildWorkspaceSkillCommandSpecs(request.workspaceDir, {
      config: request.config,
      skillFilter: request.skillFilter,
    });
    const bySkillName = new Map(commands.map((spec) => [spec.skillName, spec]));

    return entries.map((entry) => {
      const command = bySkillName.get(entry.skill.name);
      return {
        name: entry.skill.name,
        description: entry.skill.description,
        sourcePath: entry.skill.filePath,
        commandName: command?.name,
        dispatch: command?.dispatch,
        disableModelInvocation: Boolean(entry.invocation?.disableModelInvocation),
        userInvocable: entry.invocation?.userInvocable !== false,
        metadata: entry.metadata as Record<string, unknown> | undefined,
      };
    });
  }
}
