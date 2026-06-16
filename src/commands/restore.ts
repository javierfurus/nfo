import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";
import { readState, writeState } from "../state.js";
import { setMusicianTmuxWindowId } from "../state-updaters.js";
import { orchestraDir } from "../config.js";
import {
  sessionName,
  sessionExists,
  createDetachedSession,
  ensureNfoSessionUi,
  respawnPane,
  setPaneOption,
} from "../tmux.js";
import { claudeFlagsForLevel } from "../permission.js";
import { ORCHESTRATOR_ROLE_PROMPT_V1 } from "../prompts/orchestrator-role.js";
import { MUSICIAN_ROLE_PROMPT_V1 } from "../prompts/musician-role.js";
import { loadOrchestratorNotes } from "./launch.js";
import type { LaunchResult } from "./launch.js";
import { migrateLegacySidebarPane } from "./dashboard-window.js";
import { runTui } from "./tui.js";
import { buildClaudeCommand } from "../claude-command.js";
import {
  orchestratorMcpConfigPath,
  writeMusicianMcpConfig,
  writeOrchestratorMcpConfig,
} from "../mcp/config.js";

function sanitiseName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  if (cleaned.length === 0) {
    return "musician";
  }
  return cleaned;
}

export async function restoreOrchestra(
  orchestraId: string,
  dryRun?: boolean,
  notifyOnPermission?: boolean,
  version = '',
): Promise<LaunchResult> {
  const state = await readState(orchestraId);
  if (!state) {
    throw new Error(`Unknown orchestra: ${orchestraId}`);
  }

  if (notifyOnPermission !== undefined) {
    state.notify_on_permission = notifyOnPermission;
    await writeState(orchestraId, state);
  }

  const name = sessionName(orchestraId);
  if (await sessionExists(name)) {
    await ensureNfoSessionUi(name);
    await migrateLegacySidebarPane(name);
    if (!dryRun) {
      await runTui({ orchestraId, version });
    }
    return { action: "attached", orchestraId };
  }

  await createDetachedSession(name, state.project_path);
  await ensureNfoSessionUi(name);
  await setPaneOption(`${name}:0`, "remain-on-exit", "on");

  const mcpConfigPath = existsSync(orchestratorMcpConfigPath(orchestraId))
    ? orchestratorMcpConfigPath(orchestraId)
    : await writeOrchestratorMcpConfig(orchestraId);
  const flags = claudeFlagsForLevel(state.permission_level);

  // Rebuild the Orchestrator's prompt file with current notes content.
  const promptFile = join(orchestraDir(orchestraId), "orchestrator-prompt.md");
  if (existsSync(promptFile)) {
    const notes = await loadOrchestratorNotes(orchestraId);
    await writeFile(promptFile, ORCHESTRATOR_ROLE_PROMPT_V1 + notes, "utf8");
  }

  await respawnPane(
    `${name}:0`,
    buildClaudeCommand({
      flags,
      resumeSessionId: state.orchestrator_session_id,
      mcpConfigPath,
      promptFile: existsSync(promptFile) ? promptFile : undefined,
      claudeConfigDir: process.env.CLAUDE_CONFIG_DIR,
    }),
  );

  // Restore musicians (Phase 2). Stopped musicians are not restored.
  for (const musician of state.musicians) {
    if (musician.status === "stopped") {
      continue;
    }
    const workingDir = musician.worktree_path ?? state.project_path;
    const winLabel = `mus-${musician.id}-${sanitiseName(musician.name)}`;
    const created = await execa("tmux", [
      "new-window",
      "-t",
      name,
      "-n",
      winLabel,
      "-c",
      workingDir,
      "-d",
      "-P",
      "-F",
      "#{window_id}",
    ]);
    const newWindowId = created.stdout.trim();
    // The recreated window has a new id; persist it so message/query target it.
    await setMusicianTmuxWindowId(orchestraId, musician.id, newWindowId);

    const musicianPromptFile = join(
      orchestraDir(orchestraId),
      `musician-${musician.id}-prompt.md`,
    );
    await writeFile(musicianPromptFile, MUSICIAN_ROLE_PROMPT_V1, "utf8");
    const musicianMcpConfigPath = await writeMusicianMcpConfig(
      orchestraId,
      musician.id,
    );
    await setPaneOption(`${name}:${newWindowId}`, "remain-on-exit", "on");
    await respawnPane(
      `${name}:${newWindowId}`,
      buildClaudeCommand({
        flags,
        resumeSessionId: musician.claude_session_id,
        mcpConfigPath: musicianMcpConfigPath,
        promptFile: musicianPromptFile,
        model: musician.model ?? "sonnet",
        claudeConfigDir: process.env.CLAUDE_CONFIG_DIR,
      }),
    );
  }

  if (!dryRun) {
    await runTui({ orchestraId, version });
  }
  return { action: "restored", orchestraId };
}
