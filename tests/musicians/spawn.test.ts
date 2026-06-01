import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createMusician } from '../../src/musicians/spawn.js';
import { makeTmpRepo, type TmpRepo } from '../helpers/tmp-repo.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';
import { readState, ensureOrchestraDir, writeState } from '../../src/state.js';
import { makeInitialState } from '../../src/state.types.js';
import { projectKeyFromPath } from '../../src/project-key.js';
import {
  createDetachedSession,
  sessionName,
  killSession,
  sessionExists,
} from '../../src/tmux.js';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { orchestraDir } from '../../src/config.js';
import { MUSICIAN_ROLE_PROMPT_V1 } from '../../src/prompts/musician-role.js';
import { musicianMcpConfigPath } from '../../src/mcp/config.js';

describe('createMusician', () => {
  const cleanups: Array<() => Promise<void>> = [];
  const sessionsToKill: string[] = [];

  beforeEach(() => { process.env.NFO_HOME = ''; });

  afterEach(async () => {
    for (const s of sessionsToKill) {
      try { await killSession(s); } catch { /* ignore */ }
    }
    sessionsToKill.length = 0;
    for (const c of cleanups) await c();
    cleanups.length = 0;
    delete process.env.NFO_HOME;
  });

  it('creates a worktree, a tmux window, and a state.json entry', async () => {
    const repo: TmpRepo = await makeTmpRepo();
    cleanups.push(repo.cleanup);
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;

    const orchestraId = projectKeyFromPath(repo.path);
    await ensureOrchestraDir(orchestraId);
    await writeState(orchestraId, makeInitialState({
      orchestraId, projectPath: repo.path, permissionLevel: 'supervised',
    }));

    const name = sessionName(orchestraId);
    sessionsToKill.push(name);
    await createDetachedSession(name, repo.path, 220, 50);

    const result = await createMusician({
      orchestraId,
      name: 'tester',
      task: 'run the test suite',
      model: 'haiku',
      dryRun: true,
    });

    expect(result.musician_id).toMatch(/^mus-\d{3}$/);
    expect(result.worktree_path).not.toBeNull();
    if (result.worktree_path) {
      expect(existsSync(result.worktree_path)).toBe(true);
    }

    const state = await readState(orchestraId);
    expect(state!.musicians).toHaveLength(1);
    expect(state!.musicians[0].name).toBe('tester');
    expect(state!.musicians[0].task_summary).toBe('run the test suite');
    expect(state!.musicians[0].status).toBe('working');
    expect(state!.musicians[0].model).toBe('haiku');

    const promptFile = await readFile(
      `${orchestraDir(orchestraId)}/musician-${result.musician_id}-prompt.md`,
      'utf8',
    );
    expect(promptFile).toBe(MUSICIAN_ROLE_PROMPT_V1);

    const mcpConfig = JSON.parse(await readFile(
      musicianMcpConfigPath(orchestraId, result.musician_id),
      'utf8',
    ));
    expect(mcpConfig.mcpServers.nfo.args).toEqual([
      'mcp-server',
      '--orchestra-id',
      orchestraId,
      '--caller-musician-id',
      result.musician_id,
    ]);
  });

  it('honours worktree=false (no worktree, runs in repo root)', async () => {
    const repo: TmpRepo = await makeTmpRepo();
    cleanups.push(repo.cleanup);
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;

    const orchestraId = projectKeyFromPath(repo.path);
    await ensureOrchestraDir(orchestraId);
    await writeState(orchestraId, makeInitialState({
      orchestraId, projectPath: repo.path, permissionLevel: 'supervised',
    }));

    const name = sessionName(orchestraId);
    sessionsToKill.push(name);
    await createDetachedSession(name, repo.path, 220, 50);

    const result = await createMusician({
      orchestraId,
      name: 'doc-writer',
      task: 'update README',
      worktree: false,
      model: 'sonnet',
      dryRun: true,
    });

    expect(result.worktree_path).toBeNull();
    const state = await readState(orchestraId);
    expect(state!.musicians[0].worktree_path).toBeNull();
    expect(state!.musicians[0].branch).toBeNull();
    expect(state!.musicians[0].model).toBe('sonnet');
  });
});
