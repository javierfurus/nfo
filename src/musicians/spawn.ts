import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";
import { addMusician } from "../state-updaters.js";
import { readState } from "../state.js";
import { orchestraDir, worktreesDir } from "../config.js";
import { addWorktree } from "../worktree.js";
import { claudeFlagsForLevel } from "../permission.js";
import { respawnPane, sessionName, setPaneOption } from "../tmux.js";
import { MUSICIAN_ROLE_PROMPT_V1 } from "../prompts/musician-role.js";
import { buildMusicianInitialPrompt } from "../prompts/tool-discipline.js";
import { nextMusicianId } from "./ids.js";
import { buildClaudeCommand } from "../claude-command.js";
import { writeMusicianMcpConfig } from "../mcp/config.js";

export interface CreateMusicianOptions {
  orchestraId: string;
  name: string;
  task: string;
  worktree?: boolean; // default true
  branchFrom?: string; // default HEAD
  model: "sonnet" | "haiku";
  dryRun?: boolean; // skip launching claude; useful for tests
  allowedTools?: string[];
}

export type CreateMusicianResult = {
  musician_id: string;
  worktree_path: string | null;
  branch: string | null;
  tmux_window_id: string;
};

export async function createMusician(
  opts: CreateMusicianOptions,
): Promise<CreateMusicianResult> {
  const state = await readState(opts.orchestraId);
  if (!state) {
    throw new Error(`Unknown orchestra: ${opts.orchestraId}`);
  }

  const musicianId = nextMusicianId(state);
  const useWorktree = opts.worktree !== false;

  let workingDir: string;
  let worktreePath: string | null = null;
  let branch: string | null = null;
  if (useWorktree) {
    worktreePath = join(worktreesDir(opts.orchestraId), musicianId);
    branch = `nfo/${musicianId}`;
    await addWorktree({
      repoRoot: state.project_path,
      path: worktreePath,
      branch,
      baseRef: opts.branchFrom,
    });
    workingDir = worktreePath;
  } else {
    workingDir = state.project_path;
  }

  const promptFile = join(
    orchestraDir(opts.orchestraId),
    `musician-${musicianId}-prompt.md`,
  );
  await writeFile(promptFile, MUSICIAN_ROLE_PROMPT_V1, "utf8");

  const session = sessionName(opts.orchestraId);
  const winLabel = `mus-${musicianId}-${sanitiseName(opts.name)}`;
  const { stdout: tmuxWindowId } = await execa("tmux", [
    "new-window",
    "-t",
    session,
    "-n",
    winLabel,
    "-c",
    workingDir,
    "-d",
    "-P",
    "-F",
    "#{window_id}",
  ]);

  if (!opts.dryRun) {
    const mcpConfigPath = await writeMusicianMcpConfig(
      opts.orchestraId,
      musicianId,
    );
    const flags = claudeFlagsForLevel(state.permission_level);
    const cmd = buildClaudeCommand({
      flags,
      mcpConfigPath,
      promptFile,
      prompt: buildMusicianInitialPrompt(opts.task),
      model: opts.model,
      allowedTools: opts.allowedTools,
    });
    await setPaneOption(
      `${session}:${tmuxWindowId.trim()}`,
      "remain-on-exit",
      "on",
    );
    await respawnPane(`${session}:${tmuxWindowId.trim()}`, cmd);
  } else {
    await writeMusicianMcpConfig(opts.orchestraId, musicianId);
  }

  const now = new Date().toISOString();
  await addMusician(opts.orchestraId, {
    id: musicianId,
    name: opts.name,
    task_summary: opts.task.slice(0, 200),
    status: "working",
    pending_permission: null,
    tmux_window_id: tmuxWindowId.trim(),
    claude_session_id: null,
    worktree_path: worktreePath,
    branch,
    spawned_at: now,
    last_activity: now,
    model: opts.model,
  });

  return {
    musician_id: musicianId,
    worktree_path: worktreePath,
    branch,
    tmux_window_id: tmuxWindowId.trim(),
  };
}

function sanitiseName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "musician"
  );
}
