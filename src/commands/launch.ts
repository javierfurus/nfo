import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveRepoRoot } from '../repo.js';
import { projectKeyFromPath } from '../project-key.js';
import { ensureOrchestraDir, readState, writeState } from '../state.js';
import { makeInitialState } from '../state.types.js';
import {
  claudeFlagsForLevel,
  type PermissionLevel,
} from '../permission.js';
import {
  sessionName,
  sessionExists,
  createDetachedSession,
  ensureNfoSessionUi,
  respawnPane,
  setPaneOption,
} from '../tmux.js';
import { ORCHESTRATOR_ROLE_PROMPT_V1 } from '../prompts/orchestrator-role.js';
import { orchestraDir } from '../config.js';
import { listOrchestras } from './list.js';
import type { OrchestraSummary } from './list.js';
import { noteRead, noteList } from '../notes.js';
import { buildClaudeCommand } from '../claude-command.js';
import { writeOrchestratorMcpConfig } from '../mcp/config.js';
import { runTui } from './tui.js';

export interface LaunchOptions {
  cwd: string;
  interactive?: boolean;          // when false, must supply permissionLevel
  permissionLevel?: PermissionLevel;
  dryRun?: boolean;               // when true, do not attach
}

export interface LaunchResult {
  action: 'created' | 'attached' | 'restored';
  orchestraId: string;
}

export type LaunchDecision =
  | { kind: 'create'; orchestraId: string; repoRoot: string }
  | { kind: 'attach_existing'; orchestraId: string }
  | { kind: 'pick'; summaries: OrchestraSummary[] }
  | { kind: 'error'; message: string };

export async function decideAction(cwd: string): Promise<LaunchDecision> {
  const repoRoot = await resolveRepoRoot(cwd);

  if (repoRoot) {
    const orchestraId = projectKeyFromPath(repoRoot);
    const existing = await readState(orchestraId);
    if (existing) {
      return { kind: 'attach_existing', orchestraId };
    }
    return { kind: 'create', orchestraId, repoRoot };
  }

  // Out of repo. Inspect known orchestras.
  const summaries = await listOrchestras();
  if (summaries.length === 0) {
    return { kind: 'error', message: 'Open NFO in a git repository to create your first orchestra.' };
  }
  const running = summaries.filter(s => s.running);
  if (running.length === 1) {
    return { kind: 'attach_existing', orchestraId: running[0].id };
  }
  return { kind: 'pick', summaries };
}

export interface CreateOrchestraOptions {
  repoRoot: string;
  orchestraId: string;
  permissionLevel: PermissionLevel;
  dryRun?: boolean;
  notifyOnPermission?: boolean;
  version?: string;
}

export async function createOrchestra(opts: CreateOrchestraOptions): Promise<LaunchResult> {
  await ensureOrchestraDir(opts.orchestraId);
  const state = makeInitialState({
    orchestraId: opts.orchestraId,
    projectPath: opts.repoRoot,
    permissionLevel: opts.permissionLevel,
    notifyOnPermission: opts.notifyOnPermission,
  });
  await writeState(opts.orchestraId, state);

  const mcpConfigPath = await writeOrchestratorMcpConfig(opts.orchestraId);

  const promptFile = join(orchestraDir(opts.orchestraId), 'orchestrator-prompt.md');
  const notes = await loadOrchestratorNotes(opts.orchestraId);
  await writeFile(promptFile, ORCHESTRATOR_ROLE_PROMPT_V1 + notes, 'utf8');

  const name = sessionName(opts.orchestraId);
  await createDetachedSession(name, opts.repoRoot);
  await ensureNfoSessionUi(name);
  await setPaneOption(`${name}:0`, 'remain-on-exit', 'on');

  const claudeFlags = claudeFlagsForLevel(opts.permissionLevel);
  const claudeCmd = buildClaudeCommand({
    flags: claudeFlags,
    mcpConfigPath,
    promptFile,
    claudeConfigDir: process.env.CLAUDE_CONFIG_DIR,
  });
  await respawnPane(`${name}:0`, claudeCmd);

  if (!opts.dryRun) {
    await runTui({ orchestraId: opts.orchestraId, version: opts.version ?? '' });
  }
  return { action: 'created', orchestraId: opts.orchestraId };
}

export async function loadOrchestratorNotes(orchestraId: string): Promise<string> {
  const files = await noteList(orchestraId);
  const ordered = ['overview.md', 'decisions.md'].filter((f) => { return files.includes(f); });
  if (ordered.length === 0) {
    return '';
  }
  const parts: string[] = ['\n\n## Curated project notes (loaded from notes/)\n'];
  for (const f of ordered) {
    const content = await noteRead(orchestraId, f);
    if (content.trim().length === 0) {
      continue;
    }
    parts.push(`\n### ${f}\n\n${content}\n`);
  }
  return parts.join('');
}
