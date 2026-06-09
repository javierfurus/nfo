import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { restoreOrchestra } from '../../src/commands/restore.js';
import { makeTmpRepo, type TmpRepo } from '../helpers/tmp-repo.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';
import { ensureOrchestraDir, writeState, readState } from '../../src/state.js';
import { makeInitialState } from '../../src/state.types.js';
import { projectKeyFromPath } from '../../src/project-key.js';
import { sessionExists, killSession, sessionName } from '../../src/tmux.js';
import { musicianMcpConfigPath } from '../../src/mcp/config.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { orchestraDir } from '../../src/config.js';
import { MUSICIAN_ROLE_PROMPT_V1 } from '../../src/prompts/musician-role.js';

describe('restoreOrchestra', () => {
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

  it('throws when orchestra is unknown', async () => {
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;
    await expect(restoreOrchestra('nope-doesnt-exist')).rejects.toThrow(/Unknown orchestra/);
  });

  it('creates a fresh tmux session for an orchestra whose state exists but session is gone', async () => {
    const repo: TmpRepo = await makeTmpRepo();
    cleanups.push(repo.cleanup);
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;

    const orchestraId = projectKeyFromPath(repo.path);
    await ensureOrchestraDir(orchestraId);
    await writeState(orchestraId, makeInitialState({
      orchestraId,
      projectPath: repo.path,
      permissionLevel: 'supervised',
    }));

    sessionsToKill.push(sessionName(orchestraId));

    const result = await restoreOrchestra(orchestraId, true);
    expect(result.action).toBe('restored');
    expect(result.orchestraId).toBe(orchestraId);
    expect(await sessionExists(sessionName(orchestraId))).toBe(true);
    const { execa } = await import('execa');
    const { stdout: status } = await execa('tmux', [
      'show-options', '-t', sessionName(orchestraId), 'status',
    ]);
    expect(status.trim()).toBe('status off');
    const { stdout: paneCount } = await execa('tmux', [
      'list-panes', '-t', `${sessionName(orchestraId)}:0`, '-F', '#{pane_index}',
    ]);
    expect(paneCount.trim().split('\n').length).toBe(1);
  });

  it('recreates windows for non-stopped musicians and updates their window id', async () => {
    const repo: TmpRepo = await makeTmpRepo();
    cleanups.push(repo.cleanup);
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;

    const orchestraId = projectKeyFromPath(repo.path);
    await ensureOrchestraDir(orchestraId);
    const initial = makeInitialState({
      orchestraId, projectPath: repo.path, permissionLevel: 'supervised',
    });
    initial.musicians.push({
      id: 'mus-001',
      name: 'tester',
      task_summary: 't',
      status: 'working',
      tmux_window_id: '@stale',
      claude_session_id: null,
      worktree_path: null,
      branch: null,
      spawned_at: '2026-05-29T10:00:00Z',
      last_activity: '2026-05-29T10:00:00Z',
      model: 'haiku',
    });
    await writeState(orchestraId, initial);

    sessionsToKill.push(sessionName(orchestraId));

    const result = await restoreOrchestra(orchestraId, true);
    expect(result.action).toBe('restored');

    const state = await readState(orchestraId);
    expect(state!.musicians[0].tmux_window_id).not.toBe('@stale');
    expect(state!.musicians[0].tmux_window_id).toMatch(/^@/);
    expect(state!.musicians[0].model).toBe('haiku');

    const musicianCfg = JSON.parse(readFileSync(musicianMcpConfigPath(orchestraId, 'mus-001'), 'utf8'));
    expect(musicianCfg.mcpServers.nfo.args).toEqual([
      'mcp-server',
      '--orchestra-id',
      orchestraId,
      '--caller-musician-id',
      'mus-001',
    ]);

    const musicianPrompt = readFileSync(
      join(orchestraDir(orchestraId), 'musician-mus-001-prompt.md'),
      'utf8',
    );
    expect(musicianPrompt).toBe(MUSICIAN_ROLE_PROMPT_V1);
  });
});
