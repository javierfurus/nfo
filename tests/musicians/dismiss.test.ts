import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { dismissMusician } from '../../src/musicians/dismiss.js';
import { createMusician } from '../../src/musicians/spawn.js';
import { makeTmpRepo, type TmpRepo } from '../helpers/tmp-repo.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';
import { ensureOrchestraDir, writeState, readState } from '../../src/state.js';
import { makeInitialState } from '../../src/state.types.js';
import { projectKeyFromPath } from '../../src/project-key.js';
import { createDetachedSession, sessionName, killSession } from '../../src/tmux.js';
import { existsSync } from 'node:fs';

describe('dismissMusician', () => {
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

  it('moves musician to archived_musicians and removes worktree (archive=false drops branch)', async () => {
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

    const spawn = await createMusician({
      orchestraId: orchId, name: 'tester', task: 'do stuff', dryRun: true,
    });
    expect(spawn.worktree_path).not.toBeNull();
    expect(existsSync(spawn.worktree_path!)).toBe(true);

    await dismissMusician({
      orchestraId: orchId,
      musicianId: spawn.musician_id,
      archiveWorktree: false,
      summary: 'rejected',
    });

    const state = await readState(orchId);
    expect(state!.musicians).toHaveLength(0);
    expect(state!.archived_musicians).toHaveLength(1);
    expect(state!.archived_musicians[0].summary).toBe('rejected');
    expect(existsSync(spawn.worktree_path!)).toBe(false);
  });

  it('defaults the archived summary from the latest idle report', async () => {
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

    const spawn = await createMusician({
      orchestraId: orchId, name: 'tester', task: 'do stuff', dryRun: true,
    });

    const stateBefore = await readState(orchId);
    stateBefore!.musicians[0].status = 'idle';
    stateBefore!.musicians[0].latest_report = {
      summary: 'ready to merge',
      next_steps: null,
      reported_at: '2026-05-29T11:00:00Z',
    };
    await writeState(orchId, stateBefore!);

    await dismissMusician({
      orchestraId: orchId,
      musicianId: spawn.musician_id,
      archiveWorktree: false,
    });

    const state = await readState(orchId);
    expect(state!.archived_musicians[0].summary).toBe('ready to merge');
  });
});
