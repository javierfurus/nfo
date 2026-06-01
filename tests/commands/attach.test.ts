import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { execa } from 'execa';
import { attachOrRestore } from '../../src/commands/attach.js';
import { makeTmpRepo, type TmpRepo } from '../helpers/tmp-repo.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';
import { ensureOrchestraDir, writeState } from '../../src/state.js';
import { makeInitialState } from '../../src/state.types.js';
import { projectKeyFromPath } from '../../src/project-key.js';
import { createDetachedSession, killSession, sessionName } from '../../src/tmux.js';

describe('attachOrRestore', () => {
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

  it('migrates a legacy split session to a dedicated dashboard window', async () => {
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

    const name = sessionName(orchestraId);
    sessionsToKill.push(name);
    await createDetachedSession(name, repo.path);
    await execa('tmux', ['split-window', '-h', '-t', `${name}:0`, '-c', repo.path]);

    const result = await attachOrRestore(orchestraId, true);
    expect(result.action).toBe('attached');

    const { stdout: paneCount } = await execa('tmux', [
      'list-panes', '-t', `${name}:0`, '-F', '#{pane_index}',
    ]);
    expect(paneCount.trim().split('\n').length).toBe(1);

    const { stdout: windows } = await execa('tmux', [
      'list-windows', '-t', name, '-F', '#{window_name}',
    ]);
    expect(windows).toContain('nfo-dashboard');
  });
});
