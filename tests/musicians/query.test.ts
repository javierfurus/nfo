import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { queryMusician } from '../../src/musicians/query.js';
import { makeTmpRepo, type TmpRepo } from '../helpers/tmp-repo.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';
import { ensureOrchestraDir, writeState } from '../../src/state.js';
import { makeInitialState } from '../../src/state.types.js';
import { projectKeyFromPath } from '../../src/project-key.js';
import { addMusician } from '../../src/state-updaters.js';
import { createDetachedSession, sessionName, killSession, sendKeys } from '../../src/tmux.js';
import { execa } from 'execa';

describe('queryMusician', () => {
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

  it('returns the visible content of the musician pane', async () => {
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;
    const repo: TmpRepo = await makeTmpRepo();
    cleanups.push(repo.cleanup);

    const orchId = projectKeyFromPath(repo.path);
    await ensureOrchestraDir(orchId);
    await writeState(orchId, makeInitialState({
      orchestraId: orchId, projectPath: repo.path, permissionLevel: 'supervised',
    }));

    const sess = sessionName(orchId);
    sessionsToKill.push(sess);
    await createDetachedSession(sess, repo.path, 220, 50);
    const { stdout: winId } = await execa('tmux', [
      'new-window', '-t', sess, '-n', 'mus-001-q', '-c', repo.path, '-d',
      '-P', '-F', '#{window_id}',
    ]);
    await addMusician(orchId, baseMus('mus-001', winId.trim()));

    await sendKeys(`${sess}:${winId.trim()}`, 'echo nfo-query-marker', true);
    await new Promise(r => setTimeout(r, 250));

    const out = await queryMusician({ orchestraId: orchId, musicianId: 'mus-001' });
    expect(out).toContain('nfo-query-marker');
  });
});

function baseMus(id: string, winId: string) {
  return {
    id, name: 'q', task_summary: 't', status: 'working' as const,
    tmux_window_id: winId, claude_session_id: null, worktree_path: null,
    branch: null,
    spawned_at: '2026-05-29T10:00:00Z', last_activity: '2026-05-29T10:00:00Z',
  };
}
