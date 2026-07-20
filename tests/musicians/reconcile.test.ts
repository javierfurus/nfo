import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { statSync } from 'node:fs';
import { execa } from 'execa';
import { reconcileMusicianLiveness } from '../../src/musicians/reconcile.js';
import { readState, writeState, ensureOrchestraDir } from '../../src/state.js';
import { makeInitialState, type Musician } from '../../src/state.types.js';
import { stateDbFile } from '../../src/config.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';
import { makeTmpRepo } from '../helpers/tmp-repo.js';
import { projectKeyFromPath } from '../../src/project-key.js';
import {
  createDetachedSession,
  sessionName,
  killSession,
  setPaneOption,
  respawnPane,
} from '../../src/tmux.js';

function makeMus(over: Partial<Musician>): Musician {
  return {
    id: 'mus-001',
    name: 'test',
    task_summary: 't',
    status: 'working',
    pending_permission: null,
    tmux_window_id: '@99',
    claude_session_id: null,
    worktree_path: null,
    branch: null,
    spawned_at: '2026-06-08T00:00:00Z',
    last_activity: '2026-06-08T00:00:00Z',
    ...over,
  };
}

async function makeDeadWindow(sess: string, cwd: string): Promise<string> {
  const { stdout: rawId } = await execa('tmux', [
    'new-window', '-t', sess, '-n', 'will-die', '-c', cwd, '-d', '-P', '-F', '#{window_id}',
  ]);
  const deadId = rawId.trim();
  await setPaneOption(`${sess}:${deadId}`, 'remain-on-exit', 'on');
  await respawnPane(`${sess}:${deadId}`, 'exit 0');
  await new Promise((r) => { setTimeout(r, 400); });
  return deadId;
}

describe('reconcileMusicianLiveness', () => {
  const cleanups: Array<() => Promise<void>> = [];
  const sessionsToKill: string[] = [];

  beforeEach(() => { process.env.NFO_HOME = ''; });

  afterEach(async () => {
    for (const s of sessionsToKill) {
      try { await killSession(s); } catch { /* ignore */ }
    }
    sessionsToKill.length = 0;
    for (const c of cleanups) { await c(); }
    cleanups.length = 0;
    delete process.env.NFO_HOME;
  });

  it('transitions a musician to stopped when its window pane is dead', async () => {
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;

    const repo = await makeTmpRepo();
    cleanups.push(repo.cleanup);

    const orchId = projectKeyFromPath(repo.path);
    await ensureOrchestraDir(orchId);

    const sess = sessionName(orchId);
    sessionsToKill.push(sess);
    await createDetachedSession(sess, repo.path, 220, 50);

    const deadId = await makeDeadWindow(sess, repo.path);

    const state = makeInitialState({ orchestraId: orchId, projectPath: repo.path, permissionLevel: 'supervised' });
    state.musicians.push(makeMus({ id: 'mus-001', status: 'working', tmux_window_id: deadId }));
    await writeState(orchId, state);

    await reconcileMusicianLiveness(orchId);

    const after = await readState(orchId);
    expect(after!.musicians[0].status).toBe('stopped');
  });

  it('keeps musician status when its window is live', async () => {
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;

    const repo = await makeTmpRepo();
    cleanups.push(repo.cleanup);

    const orchId = projectKeyFromPath(repo.path);
    await ensureOrchestraDir(orchId);

    const sess = sessionName(orchId);
    sessionsToKill.push(sess);
    await createDetachedSession(sess, repo.path, 220, 50);

    const { stdout: liveIdRaw } = await execa('tmux', ['display-message', '-p', '-t', sess, '#{window_id}']);
    const liveId = liveIdRaw.trim();

    const state = makeInitialState({ orchestraId: orchId, projectPath: repo.path, permissionLevel: 'supervised' });
    state.musicians.push(makeMus({ id: 'mus-001', status: 'working', tmux_window_id: liveId }));
    await writeState(orchId, state);

    await reconcileMusicianLiveness(orchId);

    const after = await readState(orchId);
    expect(after!.musicians[0].status).toBe('working');
  });

  it('leaves already-stopped musicians alone even if their window is absent', async () => {
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;

    const repo = await makeTmpRepo();
    cleanups.push(repo.cleanup);

    const orchId = projectKeyFromPath(repo.path);
    await ensureOrchestraDir(orchId);

    const sess = sessionName(orchId);
    sessionsToKill.push(sess);
    await createDetachedSession(sess, repo.path, 220, 50);

    const state = makeInitialState({ orchestraId: orchId, projectPath: repo.path, permissionLevel: 'supervised' });
    state.musicians.push(makeMus({ id: 'mus-001', status: 'stopped', tmux_window_id: '@9999' }));
    await writeState(orchId, state);

    await reconcileMusicianLiveness(orchId);

    const after = await readState(orchId);
    expect(after!.musicians[0].status).toBe('stopped');
    expect(after!.musicians[0].last_activity).toBe('2026-06-08T00:00:00Z');
  });

  it('does not write state when no musician status changes', async () => {
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;

    const repo = await makeTmpRepo();
    cleanups.push(repo.cleanup);

    const orchId = projectKeyFromPath(repo.path);
    await ensureOrchestraDir(orchId);

    const sess = sessionName(orchId);
    sessionsToKill.push(sess);
    await createDetachedSession(sess, repo.path, 220, 50);

    const { stdout: liveIdRaw } = await execa('tmux', ['display-message', '-p', '-t', sess, '#{window_id}']);
    const liveId = liveIdRaw.trim();

    const state = makeInitialState({ orchestraId: orchId, projectPath: repo.path, permissionLevel: 'supervised' });
    state.musicians.push(makeMus({ id: 'mus-001', status: 'working', tmux_window_id: liveId }));
    await writeState(orchId, state);

    const { mtimeMs: before } = statSync(stateDbFile(orchId));
    await reconcileMusicianLiveness(orchId);
    const { mtimeMs: after } = statSync(stateDbFile(orchId));

    expect(after).toBe(before);
  });

  it('returns early without throwing when state is null', async () => {
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;

    await expect(reconcileMusicianLiveness('nonexistent-orch-id')).resolves.toBeUndefined();
  });

  it('returns early without throwing when the main session is not alive', async () => {
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;

    const repo = await makeTmpRepo();
    cleanups.push(repo.cleanup);

    const orchId = projectKeyFromPath(repo.path);
    await ensureOrchestraDir(orchId);

    const state = makeInitialState({ orchestraId: orchId, projectPath: repo.path, permissionLevel: 'supervised' });
    state.musicians.push(makeMus({ id: 'mus-001', status: 'working', tmux_window_id: '@99' }));
    await writeState(orchId, state);

    // No session created — sessionExists will return false.
    await expect(reconcileMusicianLiveness(orchId)).resolves.toBeUndefined();

    const after = await readState(orchId);
    expect(after!.musicians[0].status).toBe('working');
  });
});
