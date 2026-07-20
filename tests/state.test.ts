import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { readState, writeState, ensureOrchestraDir } from '../src/state.js';
import { addMusician } from '../src/state-updaters.js';
import { makeInitialState } from '../src/state.types.js';
import { makeTmpConfig } from './helpers/tmp-config.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { orchestraDir, stateFile } from '../src/config.js';

describe('state read/write', () => {
  const cleanups: Array<() => Promise<void>> = [];

  beforeEach(() => {
    process.env.NFO_HOME = '';
  });

  afterEach(async () => {
    for (const c of cleanups) await c();
    cleanups.length = 0;
    delete process.env.NFO_HOME;
  });

  it('writes and reads back the orchestra state round-trip', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;

    const state = makeInitialState({
      orchestraId: 'abc123-test',
      projectPath: '/tmp/example',
      permissionLevel: 'supervised',
    });

    await ensureOrchestraDir('abc123-test');
    await writeState('abc123-test', state);

    const loaded = await readState('abc123-test');
    expect(loaded).not.toBeNull();
    expect(loaded!.orchestra_id).toBe('abc123-test');
    expect(loaded!.permission_level).toBe('supervised');
    expect(loaded!.musicians).toEqual([]);
  });

  it('round-trips a full state including musicians and archived musicians losslessly', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;

    const state = makeInitialState({
      orchestraId: 'full-round-trip',
      projectPath: '/tmp/example',
      permissionLevel: 'autonomous',
      notifyOnPermission: true,
    });
    state.orchestrator_session_id = 'orch-sess-1';
    state.musicians.push({
      id: 'mus-001',
      name: 'tester',
      task_summary: 'run tests',
      status: 'working',
      tmux_window_id: '@1',
      claude_session_id: 'sess-1',
      worktree_path: '/tmp/w1',
      branch: 'nfo/mus-001',
      spawned_at: '2026-07-01T10:00:00Z',
      last_activity: '2026-07-01T10:05:00Z',
      latest_report: { summary: 'done', next_steps: 'more work', reported_at: '2026-07-01T10:04:00Z' },
      model: 'haiku',
      detail: 'running tests',
      last_state_report: '2026-07-01T10:03:00Z',
    });
    state.archived_musicians.push({
      id: 'mus-002',
      name: 'archived-one',
      task_summary: 'old task',
      status: 'stopped',
      tmux_window_id: '@2',
      claude_session_id: null,
      worktree_path: null,
      branch: null,
      spawned_at: '2026-06-01T10:00:00Z',
      last_activity: '2026-06-01T11:00:00Z',
      dismissed_at: '2026-06-01T12:00:00Z',
      summary: 'wrapped up',
    });

    await ensureOrchestraDir('full-round-trip');
    await writeState('full-round-trip', state);

    const loaded = await readState('full-round-trip');
    expect(loaded).toEqual(state);
  });

  it('returns null when no state exists for the given key', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;

    const loaded = await readState('does-not-exist');
    expect(loaded).toBeNull();
  });

  it('ensureOrchestraDir creates the standard subdirectory layout', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;

    await ensureOrchestraDir('abc123-test');
    const base = join(tmp.path, 'projects', 'abc123-test');
    expect(existsSync(base)).toBe(true);
    expect(existsSync(join(base, 'notes'))).toBe(true);
    expect(existsSync(join(base, 'logs'))).toBe(true);
    expect(existsSync(join(base, 'worktrees'))).toBe(true);
    expect(existsSync(join(base, 'archive'))).toBe(true);
  });

  it('concurrent update() calls do not lose writes', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;

    const orchestraId = 'concurrent-test';
    await ensureOrchestraDir(orchestraId);
    await writeState(orchestraId, makeInitialState({
      orchestraId, projectPath: '/tmp/example', permissionLevel: 'autonomous',
    }));

    // Each addMusician() call is a read-modify-write through state-updaters'
    // update(). On the old JSON implementation, firing these concurrently
    // raced (readState/writeState both had real await points, so one
    // caller's write could clobber another's in-memory read). update() is
    // now a single synchronous SQLite transaction per call, so no
    // interleaving is possible and every mutation survives.
    const ids = Array.from({ length: 20 }, (_, i) => `mus-${i}`);
    await Promise.all(ids.map((id) => addMusician(orchestraId, {
      id,
      name: id,
      task_summary: 't',
      status: 'working',
      tmux_window_id: `@${id}`,
      claude_session_id: null,
      worktree_path: null,
      branch: null,
      spawned_at: '2026-07-01T00:00:00Z',
      last_activity: '2026-07-01T00:00:00Z',
    })));

    const loaded = await readState(orchestraId);
    const gotIds = loaded!.musicians.map((m) => m.id).sort();
    expect(gotIds).toEqual([...ids].sort());
  });

  it('migrates a legacy state.json on first read and renames it to .migrated', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;

    const orchestraId = 'legacy-migrate';
    const legacyState = makeInitialState({
      orchestraId,
      projectPath: '/tmp/legacy',
      permissionLevel: 'supervised',
    });
    legacyState.orchestrator_session_id = 'legacy-sess';
    legacyState.musicians.push({
      id: 'mus-legacy',
      name: 'legacy-musician',
      task_summary: 'pre-existing work',
      status: 'idle',
      tmux_window_id: '@9',
      claude_session_id: null,
      worktree_path: null,
      branch: null,
      spawned_at: '2026-01-01T00:00:00Z',
      last_activity: '2026-01-01T00:00:00Z',
    });

    await mkdir(orchestraDir(orchestraId), { recursive: true });
    await writeFile(stateFile(orchestraId), JSON.stringify(legacyState, null, 2), 'utf8');

    const loaded = await readState(orchestraId);
    expect(loaded).not.toBeNull();
    expect(loaded!.orchestrator_session_id).toBe('legacy-sess');
    expect(loaded!.musicians).toHaveLength(1);
    expect(loaded!.musicians[0].id).toBe('mus-legacy');

    expect(existsSync(stateFile(orchestraId))).toBe(false);
    expect(existsSync(`${stateFile(orchestraId)}.migrated`)).toBe(true);
  });
});
